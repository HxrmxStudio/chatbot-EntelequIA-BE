import { WF1_MAX_TEXT_CHARS } from '@/modules/wf1/domain/text-policy';
import { ALLOWED_SOURCES, type AllowedSource } from './types';
import {
  ACCESS_TOKEN_HEADER_ONLY_ERROR,
  MAX_STRING_LENGTH,
  MIN_MESSAGE_LENGTH,
} from './constants';

export function assertNoBodyAccessToken(data: Record<string, unknown>): void {
  if (Object.prototype.hasOwnProperty.call(data, 'accessToken')) {
    throw new Error(ACCESS_TOKEN_HEADER_ONLY_ERROR);
  }
}

export function validateSource(source: unknown): AllowedSource {
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

export function validateOptionalStringField(
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

export function validateMessage(value: unknown): string {
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
