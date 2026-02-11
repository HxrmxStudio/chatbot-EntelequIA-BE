import { Injectable } from '@nestjs/common';
import { ensureObject } from '@/common/utils/object.utils';
import {
  assertNoBodyAccessToken,
  validateMessage,
  validateOptionalStringField,
  validateSource,
} from './field-validators';
import type { InputValidationNodeOutput } from './types';

@Injectable()
export class InputValidationService {
  validate(input: unknown): InputValidationNodeOutput {
    const data = ensureObject(input);
    assertNoBodyAccessToken(data);
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
