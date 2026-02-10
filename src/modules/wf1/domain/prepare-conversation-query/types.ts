export interface ConversationUserContext {
  id: string;
  email: string;
  name: string;
}

export type PrepareConversationQueryOutput<TEventContext extends Record<string, unknown>> = TEventContext & {
  user: ConversationUserContext;
};
