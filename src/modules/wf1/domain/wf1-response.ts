import type { IntentName } from './intent';

export type Wf1SuccessResponse = {
  ok: true;
  message: string;
  conversationId: string;
  intent?: IntentName;
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
