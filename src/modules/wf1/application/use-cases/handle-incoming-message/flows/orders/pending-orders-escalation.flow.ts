import type { Wf1Response } from '@/modules/wf1/domain/wf1-response';
import type { ConversationHistoryRow } from '@/modules/wf1/domain/conversation-history';
import {
  buildCancelledOrderEscalationActionResponse,
  buildCancelledOrderEscalationDeclinedResponse,
  buildCancelledOrderEscalationUnknownAnswerResponse,
} from '../../responses/orders/orders-escalation-response';
import {
  type OrdersEscalationFlowState,
  resolveCancelledOrderEscalationAnswer,
  resolveRecentCancelledOrderId,
} from './resolve-orders-escalation-flow-state';

export interface PendingOrdersEscalationFlowResult {
  response: Wf1Response;
  nextFlowState: OrdersEscalationFlowState;
}

export function handlePendingOrdersEscalationFlow(input: {
  text: string;
  historyRows: ConversationHistoryRow[];
}): PendingOrdersEscalationFlowResult {
  const answer = resolveCancelledOrderEscalationAnswer(input.text);
  const orderId = resolveRecentCancelledOrderId(input.historyRows);

  if (answer === 'yes') {
    return {
      response: buildCancelledOrderEscalationActionResponse({
        orderId,
      }),
      nextFlowState: null,
    };
  }

  if (answer === 'no') {
    return {
      response: buildCancelledOrderEscalationDeclinedResponse(),
      nextFlowState: null,
    };
  }

  return {
    response: buildCancelledOrderEscalationUnknownAnswerResponse(),
    nextFlowState: 'awaiting_cancelled_reason_confirmation',
  };
}
