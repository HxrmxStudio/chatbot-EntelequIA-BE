export class OpenAiHttpError extends Error {
  constructor(public readonly status: number) {
    super(`OpenAI HTTP ${status}`);
    this.name = 'OpenAiHttpError';
  }
}

export class OpenAiSchemaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OpenAiSchemaError';
  }
}

export class OpenAiEmptyOutputError extends Error {
  constructor() {
    super('OpenAI response missing text');
    this.name = 'OpenAiEmptyOutputError';
  }
}
