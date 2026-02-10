import 'express';

declare module 'express-serve-static-core' {
  interface Request {
    rawBody?: string;
    requestId?: string;
    externalEventId?: string;
    signatureValidation?: {
      validSignature: true;
      source: 'web' | 'whatsapp';
      timestamp: string;
      message: string;
      userId?: string;
      conversationId?: string;
      text?: string;
      accessToken?: string;
      currency?: string;
      locale?: string;
    };
    inputValidation?: {
      source: 'web' | 'whatsapp';
      text: string;
      userId?: string;
      conversationId?: string;
      accessToken?: string;
      currency?: 'ARS' | 'USD';
      locale?: string;
    };
    extractedVariables?: {
      source: string | null;
      userId: string | null;
      conversationId: string | null;
      text: string | null;
      channel: string | null;
      timestamp: string | null;
      validated: string | null;
      validSignature: string | null;
    };
  }
}
