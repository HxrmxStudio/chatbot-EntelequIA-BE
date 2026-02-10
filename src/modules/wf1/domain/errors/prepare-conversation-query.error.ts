/**
 * Errors raised while assembling the unified conversation context object.
 *
 * This step is a boundary/assembler: it should be pure and deterministic.
 * Failures indicate a broken upstream contract (missing/invalid context).
 */

export class PrepareConversationQueryMissingEventContextError extends Error {
  constructor() {
    super('Missing upstream event context');
    this.name = 'PREPARE_CONVERSATION_QUERY_MISSING_EVENT_CONTEXT';
  }
}

export class PrepareConversationQueryMissingUserContextError extends Error {
  constructor() {
    super('Missing user context');
    this.name = 'PREPARE_CONVERSATION_QUERY_MISSING_USER_CONTEXT';
  }
}

export class PrepareConversationQueryInvalidShapeError extends Error {
  constructor() {
    super('Invalid shape for prepare conversation query input');
    this.name = 'PREPARE_CONVERSATION_QUERY_INVALID_SHAPE';
  }
}

