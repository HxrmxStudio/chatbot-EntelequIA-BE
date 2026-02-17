import type { IntentResult } from '@/modules/wf1/domain/intent';
import type { Sentiment } from '@/modules/wf1/domain/output-validation';
import type { EntelequiaContextPort } from '../../ports/entelequia-context.port';
import type { PromptTemplatesPort } from '../../ports/prompt-templates.port';

export interface EnrichInput {
  intentResult: IntentResult;
  text: string;
  sentiment?: Sentiment;
  currency?: 'ARS' | 'USD';
  accessToken?: string;
  requestId?: string;
  conversationId?: string;
  orderIdOverride?: string;
}

export interface EnrichDeps {
  entelequiaContextPort: EntelequiaContextPort;
  promptTemplates: PromptTemplatesPort;
}

export interface RecommendationsConfig {
  disambiguationEnabled: boolean;
  franchiseThreshold: number;
  volumeThreshold: number;
}
