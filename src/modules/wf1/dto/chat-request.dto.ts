import type { ChannelSource } from '../domain/source';

/**
 * Payload shape for chat message requests.
 * Validation is performed by the guard pipeline (SignatureGuard, InputValidationGuard, ExtractVariablesGuard).
 */
export interface ChatRequestDto {
  source: ChannelSource;
  userId: string;
  conversationId: string;
  text: string;
  accessToken?: string;
  currency?: 'ARS' | 'USD';
  locale?: string;
}
