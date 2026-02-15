import type { Logger } from '@/common/utils/logger';
import type { ChatPersistencePort } from '@/modules/wf1/application/ports/chat-persistence.port';
import type { EntelequiaContextPort } from '@/modules/wf1/application/ports/entelequia-context.port';
import type { IntentExtractorPort } from '@/modules/wf1/application/ports/intent-extractor.port';
import type { ChatRequestDto } from '@/modules/wf1/dto/chat-request.dto';
import {
  mapConversationHistoryRowsToMessageHistoryItems,
  type ConversationHistoryRow,
} from '@/modules/wf1/domain/conversation-history';
import type { OutputValidatedIntentResult } from '@/modules/wf1/domain/output-validation';
import { validateAndEnrichIntentOutput } from '@/modules/wf1/domain/output-validation';
import { prepareConversationQuery } from '@/modules/wf1/domain/prepare-conversation-query';
import { resolveIntentRoute } from '@/modules/wf1/domain/intent-routing';
import type { UserContext } from '@/modules/wf1/domain/user';
import { ExternalServiceError } from '@/modules/wf1/domain/errors';
import { checkIfAuthenticated } from '../support/check-if-authenticated';

export interface PreparedRequestContext {
  effectiveUserId: string;
  historyRows: ConversationHistoryRow[];
  history: ReturnType<typeof mapConversationHistoryRowsToMessageHistoryItems>;
  conversationContext: Record<string, unknown>;
  validatedIntent: OutputValidatedIntentResult;
  routedIntent: string;
  routedIntentResult: OutputValidatedIntentResult & { intent: string };
}

export async function prepareRequestContext(input: {
  requestId: string;
  payload: ChatRequestDto;
  sanitizedText: string;
  idempotencyPayload: Record<string, unknown>;
  historyLimit: number;
  chatPersistence: ChatPersistencePort;
  entelequiaContextPort: EntelequiaContextPort;
  intentExtractor: IntentExtractorPort;
  logger: Pick<Logger, 'chat' | 'info'>;
}): Promise<PreparedRequestContext> {
  const user = await resolveUserContext({
    payload: input.payload,
    chatPersistence: input.chatPersistence,
    entelequiaContextPort: input.entelequiaContextPort,
  });
  const effectiveUserId = user.id;
  const conversationContext = prepareConversationQuery(input.idempotencyPayload, user);

  await input.chatPersistence.upsertConversation({
    conversationId: input.payload.conversationId,
    userId: effectiveUserId,
    channel: input.payload.source,
  });

  const historyRows = await input.chatPersistence.getConversationHistoryRows({
    conversationId:
      typeof conversationContext.conversationId === 'string'
        ? conversationContext.conversationId
        : input.payload.conversationId,
    limit: input.historyLimit,
  });
  const history = mapConversationHistoryRowsToMessageHistoryItems(historyRows);

  const intentResult = await input.intentExtractor.extractIntent({
    text: input.sanitizedText,
    requestId: input.requestId,
    source: input.payload.source,
    userId: effectiveUserId,
    conversationId: input.payload.conversationId,
  });

  const validatedIntent = validateAndEnrichIntentOutput({
    originalText: input.sanitizedText,
    intentResult,
  });
  const routedIntent = resolveIntentRoute(validatedIntent.intent);
  const routedIntentResult = { ...validatedIntent, intent: routedIntent };
  const enrichedData = { ...conversationContext, ...validatedIntent };

  input.logger.chat(`sentiment_${validatedIntent.sentiment}_detected`, {
    event: `sentiment_${validatedIntent.sentiment}_detected`,
    request_id: input.requestId,
    conversation_id: input.payload.conversationId,
    user_id: effectiveUserId,
    intent: routedIntent,
    confidence: validatedIntent.confidence,
    sentiment: validatedIntent.sentiment,
  });

  input.logger.chat('intent_routed', {
    event: 'intent_routed',
    request_id: input.requestId,
    conversation_id: input.payload.conversationId,
    user_id: effectiveUserId,
    intent_raw: validatedIntent.intent,
    intent_route: routedIntent,
  });

  input.logger.chat('output_validation_complete', {
    event: 'output_validation_complete',
    request_id: input.requestId,
    conversation_id: input.payload.conversationId,
    user_id: effectiveUserId,
    intent: routedIntent,
    confidence: validatedIntent.confidence,
    entities_count: validatedIntent.entities.length,
    sentiment: validatedIntent.sentiment,
    enriched_data_keys: Object.keys(enrichedData),
  });

  input.logger.info('final_stage_started', {
    event: 'final_stage_started',
    request_id: input.requestId,
    conversation_id: input.payload.conversationId,
    intent: routedIntent,
    source: input.payload.source,
  });

  return {
    effectiveUserId,
    historyRows,
    history,
    conversationContext,
    validatedIntent,
    routedIntent,
    routedIntentResult,
  };
}

export async function resolveUserContext(input: {
  payload: ChatRequestDto;
  chatPersistence: ChatPersistencePort;
  entelequiaContextPort: EntelequiaContextPort;
}): Promise<UserContext> {
  const accessToken = input.payload.accessToken;
  if (!checkIfAuthenticated(accessToken)) {
    return input.chatPersistence.upsertUser(input.payload.userId);
  }

  if (typeof accessToken !== 'string') {
    return input.chatPersistence.upsertUser(input.payload.userId);
  }

  let profile: Awaited<ReturnType<EntelequiaContextPort['getAuthenticatedUserProfile']>>;
  try {
    profile = await input.entelequiaContextPort.getAuthenticatedUserProfile({
      accessToken,
    });
  } catch (error: unknown) {
    if (error instanceof ExternalServiceError && error.statusCode === 401) {
      return input.chatPersistence.upsertUser(input.payload.userId);
    }

    throw error;
  }

  const resolvedUserId =
    typeof profile.id === 'string' && profile.id.trim().length > 0
      ? profile.id.trim()
      : input.payload.userId;
  const email = profile.email.trim();
  const name = profile.name.trim();

  if (email.length === 0 || name.length === 0) {
    throw new Error('Invalid authenticated profile payload');
  }

  return input.chatPersistence.upsertAuthenticatedUserProfile({
    id: resolvedUserId,
    email,
    phone: profile.phone.trim(),
    name,
  });
}
