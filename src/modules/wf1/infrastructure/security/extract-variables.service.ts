import { Injectable } from '@nestjs/common';
import { ensureObject } from '../../../../common/utils/object.utils';

const EXTRACTED_FIELDS = [
  'source',
  'userId',
  'conversationId',
  'text',
  'channel',
  'timestamp',
  'validated',
  'validSignature',
] as const;

type ExtractedFieldName = (typeof EXTRACTED_FIELDS)[number];

export type ExtractedVariablesNodeOutput = Record<ExtractedFieldName, string | null>;

@Injectable()
export class ExtractVariablesService {
  extract(input: unknown): ExtractedVariablesNodeOutput {
    const data = ensureObject(
      input,
      'Invalid payload: expected object for variable extraction',
    );
    const output = {} as ExtractedVariablesNodeOutput;

    for (const field of EXTRACTED_FIELDS) {
      output[field] = toNodeStringValue(data[field]);
    }

    return output;
  }
}

function toNodeStringValue(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  return String(value);
}
