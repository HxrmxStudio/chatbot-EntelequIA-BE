import { Inject, Injectable } from '@nestjs/common';
import {
  ENTELEQUIA_CONTEXT_PORT,
} from '../ports/tokens';
import type { EntelequiaContextPort } from '../ports/entelequia-context.port';
import type { ContextBlock } from '../../domain/context-block';
import type { IntentResult } from '../../domain/intent';

export class MissingAuthForOrdersError extends Error {
  constructor() {
    super('Missing authentication token for order intent');
    this.name = 'MissingAuthForOrdersError';
  }
}

@Injectable()
export class EnrichContextByIntentUseCase {
  constructor(
    @Inject(ENTELEQUIA_CONTEXT_PORT)
    private readonly entelequiaContextPort: EntelequiaContextPort,
  ) {}

  async execute(input: {
    intentResult: IntentResult;
    text: string;
    currency?: 'ARS' | 'USD';
    accessToken?: string;
  }): Promise<ContextBlock[]> {
    const { intentResult } = input;

    switch (intentResult.intent) {
      case 'products': {
        const products = await this.entelequiaContextPort.getProducts({
          query: resolveProductsQuery(intentResult.entities, input.text),
          currency: input.currency,
        });

        return [products];
      }

      case 'orders': {
        if (!input.accessToken) {
          throw new MissingAuthForOrdersError();
        }

        const orderId = resolveOrderId(intentResult.entities, input.text);
        if (orderId) {
          const orderDetail = await this.entelequiaContextPort.getOrderDetail({
            accessToken: input.accessToken,
            orderId,
          });

          return [orderDetail];
        }

        const orders = await this.entelequiaContextPort.getOrders({
          accessToken: input.accessToken,
        });

        return [orders];
      }

      case 'payment_shipping': {
        const paymentInfo = await this.entelequiaContextPort.getPaymentInfo();
        return [paymentInfo];
      }

      case 'tickets':
        return [
          {
            contextType: 'tickets',
            contextPayload: {
              escalationHint:
                'Detectamos un caso de soporte/reclamo. Priorizar contencion, pedir datos clave y ofrecer derivacion humana.',
            },
          },
        ];

      case 'recommendations': {
        const recommendations = await this.entelequiaContextPort.getRecommendations({
          currency: input.currency,
        });

        return [recommendations];
      }

      case 'store_info': {
        return [
          {
            contextType: 'store_info',
            contextPayload: {
              info:
                'Atendemos consultas de catalogo, pedidos y medios de pago. Para casos complejos, derivamos a soporte humano.',
            },
          },
        ];
      }

      case 'general':
      default:
        return [
          {
            contextType: 'general',
            contextPayload: {
              hint: 'Responder con claridad y pedir precision cuando falten datos.',
            },
          },
        ];
    }
  }
}

function resolveProductsQuery(entities: string[], originalText: string): string {
  const cleanedEntities = entities
    .map((entity) => entity.trim())
    .filter((entity) => entity.length > 0);

  if (cleanedEntities.length === 0) {
    return originalText;
  }

  return cleanedEntities.join(' ');
}

function resolveOrderId(entities: string[], originalText: string): string | undefined {
  const candidates = [...entities, originalText];

  for (const candidate of candidates) {
    const match = candidate.match(/(?:pedido|orden|order)?\s*#?\s*(\d{1,12})/i);
    if (match?.[1]) {
      return match[1];
    }
  }

  return undefined;
}
