/**
 * Thrown when an order-related intent requires authentication
 * but no access token was provided.
 */
export class MissingAuthForOrdersError extends Error {
  constructor() {
    super('Missing authentication token for order intent');
    this.name = 'MissingAuthForOrdersError';
  }
}
