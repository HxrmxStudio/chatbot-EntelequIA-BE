import { Injectable } from '@nestjs/common';

@Injectable()
export class TextSanitizer {
  sanitize(rawText: string): string {
    if (typeof rawText !== 'string') {
      return '';
    }

    const withoutTags = rawText.replace(/<[^>]*>/g, ' ');
    const withoutControls = withoutTags.replace(/[\u0000-\u001F\u007F]/g, ' ');
    const normalizedWhitespace = withoutControls.replace(/\s+/g, ' ').trim();
    return normalizedWhitespace.slice(0, 4096);
  }
}
