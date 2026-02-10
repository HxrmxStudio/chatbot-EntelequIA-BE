import { Injectable } from '@nestjs/common';
import { sanitizeText } from '../../domain/text-sanitizer';

/**
 * Injectable wrapper for the domain sanitizeText function.
 * Enables DI while keeping domain logic pure.
 */
@Injectable()
export class TextSanitizer {
  sanitize(rawText: string): string {
    return sanitizeText(rawText);
  }
}
