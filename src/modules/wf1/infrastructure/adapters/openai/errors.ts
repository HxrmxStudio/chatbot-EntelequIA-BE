export class OpenAiHttpError extends Error {
  constructor(public readonly status: number) {
    super(`OpenAI HTTP ${status}`);
    this.name = 'OpenAiHttpError';
  }
}
