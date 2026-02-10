import { IntentValidationError } from '../intent-validator';

export class IntentExtractorHttpError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly body: string,
  ) {
    super(`Intent extractor OpenAI HTTP ${statusCode}`);
    this.name = 'IntentExtractorHttpError';
  }
}

export class IntentExtractorNetworkError extends Error {
  constructor(public readonly code: 'timeout' | 'network') {
    super(`Intent extractor OpenAI ${code}`);
    this.name = 'IntentExtractorNetworkError';
  }
}

export { IntentValidationError };
