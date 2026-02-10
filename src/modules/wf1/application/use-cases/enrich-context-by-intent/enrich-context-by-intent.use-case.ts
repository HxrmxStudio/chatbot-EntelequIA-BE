import { Inject, Injectable } from '@nestjs/common';
import type { ContextBlock } from '../../../domain/context-block';
import { ExternalServiceError, MissingAuthForOrdersError } from '../../../domain/errors';
import type { IntentResult } from '../../../domain/intent';
import {
  buildProductAvailabilityHint,
  selectBestProductMatch,
} from '../../../domain/products-context';
import { ENTELEQUIA_CONTEXT_PORT } from '../../ports/tokens';
import type { EntelequiaContextPort } from '../../ports/entelequia-context.port';
import { resolveProductsQuery, resolveOrderId } from './query-resolvers';
import { extractProductItems } from './product-parsers';

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
        const query = resolveProductsQuery(intentResult.entities, input.text);
        const products = await this.entelequiaContextPort.getProducts({
          query,
          currency: input.currency,
        });

        const items = extractProductItems(products.contextPayload);
        const bestMatch = selectBestProductMatch({
          items,
          entities: intentResult.entities,
          text: input.text,
        });

        if (!bestMatch) {
          return [products];
        }

        const productsWithBest: ContextBlock = {
          ...products,
          contextPayload: {
            ...products.contextPayload,
            bestMatch,
            availabilityHint: buildProductAvailabilityHint(bestMatch),
          },
        };

        try {
          const detail = await this.entelequiaContextPort.getProductDetail({
            idOrSlug: bestMatch.slug,
            currency: input.currency,
          });

          return [productsWithBest, detail];
        } catch (error: unknown) {
          // Product detail is an optional enrichment step. If it fails, keep going with the list context.
          if (error instanceof ExternalServiceError) {
            return [productsWithBest];
          }

          throw error;
        }
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
