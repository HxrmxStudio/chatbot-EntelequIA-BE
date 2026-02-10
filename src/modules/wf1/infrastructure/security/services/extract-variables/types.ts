export const EXTRACTED_FIELDS = [
  'source',
  'userId',
  'conversationId',
  'text',
  'channel',
  'timestamp',
  'validated',
  'validSignature',
] as const;

export type ExtractedFieldName = (typeof EXTRACTED_FIELDS)[number];

export type ExtractedVariablesNodeOutput = Record<ExtractedFieldName, string | null>;
