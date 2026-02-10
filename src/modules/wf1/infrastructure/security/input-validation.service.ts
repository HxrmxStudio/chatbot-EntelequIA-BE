import { Injectable } from '@nestjs/common';
import { WF1_MAX_TEXT_CHARS } from '../../domain/text-policy';
import { ensureObject } from '../../../../common/utils/object.utils';

const MAX_STRING_LENGTH = 255;
const MIN_MESSAGE_LENGTH = 1;
const ALLOWED_SOURCES = ['web', 'whatsapp'] as const;

type AllowedSource = (typeof ALLOWED_SOURCES)[number];

export type InputValidationNodeOutput = Record<string, unknown> & {
  source: AllowedSource;
  text: string;
  userId?: string;
  conversationId?: string;
};

@Injectable()
export class InputValidationService {
  validate(input: unknown): InputValidationNodeOutput {
    const data = ensureObject(input);
    const source = validateSource(data.source);
    const text = validateMessage(data.text);
    const userId = validateOptionalStringField('userId', data.userId);
    const conversationId = validateOptionalStringField(
      'conversationId',
      data.conversationId,
    );

    const output: InputValidationNodeOutput = {
      ...data,
      source,
      text,
    };

    if (userId !== undefined) {
      output.userId = userId;
    }

    if (conversationId !== undefined) {
      output.conversationId = conversationId;
    }

    return output;
  }
}

function validateSource(source: unknown): AllowedSource {
  if (!source || typeof source !== 'string') {
    throw new Error('Invalid source: source is required and must be a string');
  }

  if (!(ALLOWED_SOURCES as readonly string[]).includes(source)) {
    throw new Error(
      `Invalid source: "${source}". Allowed values are: ${ALLOWED_SOURCES.join(', ')}`,
    );
  }

  return source as AllowedSource;
}

function validateOptionalStringField(
  fieldName: string,
  value: unknown,
): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== 'string') {
    throw new Error(`Invalid ${fieldName}: must be a string`);
  }

  const trimmed = value.trim();
  if (trimmed.length > MAX_STRING_LENGTH) {
    throw new Error(`Invalid ${fieldName}: exceeds maximum length`);
  }

  return trimmed;
}

function validateMessage(value: unknown): string {
  if (value === undefined || value === null) {
    throw new Error('Invalid message: text is required');
  }

  if (typeof value !== 'string') {
    throw new Error('Invalid message: must be a string');
  }

  const trimmed = value.trim();
  if (trimmed.length < MIN_MESSAGE_LENGTH) {
    throw new Error('Invalid message: message is too short');
  }

  if (trimmed.length > WF1_MAX_TEXT_CHARS) {
    throw new Error('Invalid message: message exceeds maximum length');
  }

    return trimmed;
}
