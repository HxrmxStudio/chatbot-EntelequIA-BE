import type { IntentName } from '../intent';
import type { UiPayloadV1 } from '../ui-payload';

export type Wf1SuccessResponse = {
  ok: true;
  message: string;
  conversationId: string;
  intent?: IntentName;
  responseId?: string;
  ui?: UiPayloadV1;
};

export type Wf1RequiresAuthResponse = {
  ok: false;
  requiresAuth: true;
  message: string;
};

export type Wf1FailureResponse = {
  ok: false;
  message: string;
};

export type Wf1Response = Wf1SuccessResponse | Wf1RequiresAuthResponse | Wf1FailureResponse;
