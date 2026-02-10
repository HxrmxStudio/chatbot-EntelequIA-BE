import { prepareConversationQuery } from '@/modules/wf1/domain/prepare-conversation-query';
import {
  PrepareConversationQueryInvalidShapeError,
  PrepareConversationQueryMissingEventContextError,
  PrepareConversationQueryMissingUserContextError,
} from '@/modules/wf1/domain/errors';

describe('prepareConversationQuery', () => {
  const user = {
    id: 'user-1',
    email: 'user-1',
    phone: '',
    name: 'Customer',
    createdAt: '2026-02-10T00:00:00.000Z',
    updatedAt: '2026-02-10T00:00:00.000Z',
  };

  it('merges event context and injects user with id/email/name', () => {
    const eventContext = {
      source: 'web',
      conversationId: 'conv-1',
      text: 'hola',
    };

    const result = prepareConversationQuery(eventContext, user);

    expect(result).toEqual({
      source: 'web',
      conversationId: 'conv-1',
      text: 'hola',
      user: {
        id: 'user-1',
        email: 'user-1',
        name: 'Customer',
      },
    });
  });

  it('overrides existing user key from event context', () => {
    const eventContext = {
      source: 'web',
      user: { id: 'old', email: 'old', name: 'Old' },
    };

    const result = prepareConversationQuery(eventContext, user);

    expect(result.user).toEqual({
      id: 'user-1',
      email: 'user-1',
      name: 'Customer',
    });
  });

  it('does not mutate the input objects', () => {
    const eventContext = { source: 'web' as const };
    const userContext = { ...user };

    const result = prepareConversationQuery(eventContext, userContext);

    expect(eventContext).toEqual({ source: 'web' });
    expect(userContext).toEqual(user);
    expect(result).not.toBe(eventContext);
  });

  it('throws missing event context error when eventContext is null/undefined', () => {
    expect(() => prepareConversationQuery(undefined, user)).toThrow(
      PrepareConversationQueryMissingEventContextError,
    );
    expect(() => prepareConversationQuery(null, user)).toThrow(
      PrepareConversationQueryMissingEventContextError,
    );
  });

  it('throws invalid shape error when eventContext is not a plain object', () => {
    expect(() => prepareConversationQuery([] as unknown as Record<string, unknown>, user)).toThrow(
      PrepareConversationQueryInvalidShapeError,
    );
    expect(() => prepareConversationQuery(1 as unknown as Record<string, unknown>, user)).toThrow(
      PrepareConversationQueryInvalidShapeError,
    );
  });

  it('throws missing user context error when userContext is null/undefined', () => {
    expect(() => prepareConversationQuery({ source: 'web' }, undefined)).toThrow(
      PrepareConversationQueryMissingUserContextError,
    );
    expect(() => prepareConversationQuery({ source: 'web' }, null)).toThrow(
      PrepareConversationQueryMissingUserContextError,
    );
  });

  it('throws invalid shape error when userContext is not a plain object', () => {
    expect(() => prepareConversationQuery({ source: 'web' }, [] as unknown as typeof user)).toThrow(
      PrepareConversationQueryInvalidShapeError,
    );
    expect(() => prepareConversationQuery({ source: 'web' }, 'x' as unknown as typeof user)).toThrow(
      PrepareConversationQueryInvalidShapeError,
    );
  });

  it('throws missing user context error when required fields are not strings', () => {
    const badUser = {
      id: 1,
      email: 'user-1',
      name: 'Customer',
    } as unknown as typeof user;

    expect(() => prepareConversationQuery({ source: 'web' }, badUser)).toThrow(
      PrepareConversationQueryMissingUserContextError,
    );
  });
});
