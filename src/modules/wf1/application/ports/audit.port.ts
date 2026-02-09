export type AuditStatus = 'success' | 'failure' | 'requires_auth' | 'duplicate';

export interface AuditEntryInput {
  requestId: string;
  userId: string;
  conversationId: string;
  source: 'web' | 'whatsapp';
  intent: string;
  status: AuditStatus;
  message: string;
  httpStatus: number;
  latencyMs: number;
  errorCode?: string;
  metadata?: Record<string, unknown>;
}

export interface AuditPort {
  writeAudit(input: AuditEntryInput): Promise<void>;
}
