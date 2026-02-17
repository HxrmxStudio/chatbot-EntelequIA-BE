import { Inject, Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ContextBlock } from '@/modules/wf1/domain/context-block';
import { ENTELEQUIA_CONTEXT_PORT, PROMPT_TEMPLATES_PORT } from '../../ports/tokens';
import type { EntelequiaContextPort } from '../../ports/entelequia-context.port';
import type { PromptTemplatesPort } from '../../ports/prompt-templates.port';
import type { EnrichInput } from './types';
import {
  enrichGeneral,
  enrichOrders,
  enrichPaymentShipping,
  enrichProducts,
  enrichRecommendations,
  enrichStoreInfo,
  enrichTickets,
} from './handlers';

const RECOMMENDATIONS_FALLBACK_THRESHOLD = 20;
const RECOMMENDATIONS_VOLUME_THRESHOLD = 10;

function resolveRecommendationsDisambiguationEnabled(
  value: string | boolean | undefined,
): boolean {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value !== 'string') {
    return true;
  }

  const normalized = value.trim().toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'yes';
}

function resolveRecommendationsThreshold(value: number | undefined, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(1, Math.floor(value));
}

@Injectable()
export class EnrichContextByIntentUseCase {
  private readonly recommendationsDisambiguationEnabled: boolean;
  private readonly recommendationsFranchiseThreshold: number;
  private readonly recommendationsVolumeThreshold: number;

  constructor(
    @Inject(ENTELEQUIA_CONTEXT_PORT)
    private readonly entelequiaContextPort: EntelequiaContextPort,
    @Inject(PROMPT_TEMPLATES_PORT)
    private readonly promptTemplates: PromptTemplatesPort,
    @Optional()
    private readonly configService?: ConfigService,
  ) {
    this.recommendationsDisambiguationEnabled = resolveRecommendationsDisambiguationEnabled(
      this.configService?.get<string | boolean>('WF1_RECOMMENDATIONS_DISAMBIGUATION_ENABLED'),
    );
    this.recommendationsFranchiseThreshold = resolveRecommendationsThreshold(
      this.configService?.get<number>('WF1_RECOMMENDATIONS_FRANCHISE_THRESHOLD'),
      RECOMMENDATIONS_FALLBACK_THRESHOLD,
    );
    this.recommendationsVolumeThreshold = resolveRecommendationsThreshold(
      this.configService?.get<number>('WF1_RECOMMENDATIONS_VOLUME_THRESHOLD'),
      RECOMMENDATIONS_VOLUME_THRESHOLD,
    );
  }

  async execute(input: EnrichInput): Promise<ContextBlock[]> {
    const { intentResult } = input;
    const deps = {
      entelequiaContextPort: this.entelequiaContextPort,
      promptTemplates: this.promptTemplates,
    };

    switch (intentResult.intent) {
      case 'products':
        return enrichProducts(input, deps);
      case 'orders':
        return enrichOrders(input, deps);
      case 'payment_shipping':
        return enrichPaymentShipping(input, deps);
      case 'tickets':
        return enrichTickets(input, deps);
      case 'recommendations':
        return enrichRecommendations(input, deps, {
          disambiguationEnabled: this.recommendationsDisambiguationEnabled,
          franchiseThreshold: this.recommendationsFranchiseThreshold,
          volumeThreshold: this.recommendationsVolumeThreshold,
        });
      case 'store_info':
        return enrichStoreInfo(input, deps);
      case 'general':
      default:
        return enrichGeneral(deps);
    }
  }
}
