import type { ChannelSource } from '@/modules/wf1/domain/source';

export type SignatureValidationNodeOutput = {
  validSignature: true;
  source: ChannelSource;
  timestamp: string;
  message: string;
} & Record<string, unknown>;
