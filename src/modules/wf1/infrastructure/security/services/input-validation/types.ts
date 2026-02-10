export const ALLOWED_SOURCES = ['web', 'whatsapp'] as const;

export type AllowedSource = (typeof ALLOWED_SOURCES)[number];

export type InputValidationNodeOutput = Record<string, unknown> & {
  source: AllowedSource;
  text: string;
  userId?: string;
  conversationId?: string;
};
