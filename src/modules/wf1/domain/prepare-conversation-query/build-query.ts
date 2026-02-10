import { ensureObject } from '../../../../common/utils/object.utils';
import type { UserContext } from '../user';
import {
  PrepareConversationQueryInvalidShapeError,
  PrepareConversationQueryMissingEventContextError,
  PrepareConversationQueryMissingUserContextError,
} from '../errors';
import type { PrepareConversationQueryOutput } from './types';

/**
 * Builds a unified context object for downstream nodes (queries/prompts).
 *
 * Semantics:
 * - Shallow-copies the event context (`{ ...eventContext }`).
 * - Adds/overrides `user` with `{ id, email, name }` from the user row.
 * - Does not mutate input objects.
 */
export function prepareConversationQuery<TEventContext extends Record<string, unknown>>(
  eventContext: TEventContext | null | undefined,
  userContext: UserContext | null | undefined,
): PrepareConversationQueryOutput<TEventContext> {
  if (eventContext === undefined || eventContext === null) {
    throw new PrepareConversationQueryMissingEventContextError();
  }

  if (userContext === undefined || userContext === null) {
    throw new PrepareConversationQueryMissingUserContextError();
  }

  const safeEventContext = ensureObject(
    eventContext,
    'Invalid event context: expected object',
    PrepareConversationQueryInvalidShapeError,
  ) as TEventContext;

  const safeUserContext = ensureObject(
    userContext,
    'Invalid user context: expected object',
    PrepareConversationQueryInvalidShapeError,
  );

  const id = safeUserContext.id;
  const email = safeUserContext.email;
  const name = safeUserContext.name;

  if (typeof id !== 'string' || typeof email !== 'string' || typeof name !== 'string') {
    throw new PrepareConversationQueryMissingUserContextError();
  }

  return {
    ...safeEventContext,
    user: { id, email, name },
  };
}
