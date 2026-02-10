import { Injectable } from '@nestjs/common';
import { ensureObject } from '@/common/utils/object.utils';
import { EXTRACTED_FIELDS, type ExtractedVariablesNodeOutput } from './types';
import { toNodeStringValue } from './field-extractor';

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
