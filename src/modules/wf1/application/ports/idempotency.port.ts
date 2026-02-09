import type { ChannelSource } from '../../domain/source';

export interface IdempotencyStartResult {
  isDuplicate: boolean;
}

export interface IdempotencyPort {
  startProcessing(input: {
    source: ChannelSource;
    externalEventId: string;
    payload: Record<string, unknown>;
    requestId: string;
  }): Promise<IdempotencyStartResult>;
  markProcessed(input: { source: ChannelSource; externalEventId: string }): Promise<void>;
  markFailed(input: {
    source: ChannelSource;
    externalEventId: string;
    errorMessage: string;
  }): Promise<void>;
}
