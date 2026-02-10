export class IntentValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IntentValidationError';
  }
}
