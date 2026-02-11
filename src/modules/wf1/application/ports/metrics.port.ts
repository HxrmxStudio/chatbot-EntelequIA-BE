export interface MetricsPort {
  incrementMessage(input: {
    source: string;
    intent: string;
    llmPath: string;
  }): void;

  observeResponseLatency(input: {
    intent: string;
    seconds: number;
  }): void;

  incrementFallback(reason: string): void;

  incrementStockExactDisclosure(): void;
}

