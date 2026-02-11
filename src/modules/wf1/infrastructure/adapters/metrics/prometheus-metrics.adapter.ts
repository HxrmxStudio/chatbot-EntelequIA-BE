import { Injectable } from '@nestjs/common';
import type { MetricsPort } from '@/modules/wf1/application/ports/metrics.port';
import {
  WF1_METRIC_FALLBACK_TOTAL,
  WF1_METRIC_MESSAGES_TOTAL,
  WF1_METRIC_RESPONSE_LATENCY_SECONDS,
  WF1_METRIC_STOCK_EXACT_DISCLOSURE_TOTAL,
  WF1_RESPONSE_LATENCY_BUCKETS,
} from '@/common/metrics';

@Injectable()
export class PrometheusMetricsAdapter implements MetricsPort {
  private readonly messages = new Map<string, number>();
  private readonly fallbacks = new Map<string, number>();
  private readonly stockExactDisclosure = new Map<string, number>();

  private readonly latencyBuckets = new Map<string, number>();
  private readonly latencySum = new Map<string, number>();
  private readonly latencyCount = new Map<string, number>();

  incrementMessage(input: { source: string; intent: string; llmPath: string }): void {
    const key = `${sanitizeLabelValue(input.source)}|${sanitizeLabelValue(input.intent)}|${sanitizeLabelValue(input.llmPath)}`;
    this.messages.set(key, (this.messages.get(key) ?? 0) + 1);
  }

  observeResponseLatency(input: { intent: string; seconds: number }): void {
    const intent = sanitizeLabelValue(input.intent);
    const latency = Number.isFinite(input.seconds) && input.seconds >= 0 ? input.seconds : 0;

    this.latencySum.set(intent, (this.latencySum.get(intent) ?? 0) + latency);
    this.latencyCount.set(intent, (this.latencyCount.get(intent) ?? 0) + 1);

    for (const bucket of WF1_RESPONSE_LATENCY_BUCKETS) {
      if (latency <= bucket) {
        const key = `${intent}|${bucket}`;
        this.latencyBuckets.set(key, (this.latencyBuckets.get(key) ?? 0) + 1);
      }
    }

    const infKey = `${intent}|+Inf`;
    this.latencyBuckets.set(infKey, (this.latencyBuckets.get(infKey) ?? 0) + 1);
  }

  incrementFallback(reason: string): void {
    const key = sanitizeLabelValue(reason);
    this.fallbacks.set(key, (this.fallbacks.get(key) ?? 0) + 1);
  }

  incrementStockExactDisclosure(): void {
    const key = 'exact';
    this.stockExactDisclosure.set(key, (this.stockExactDisclosure.get(key) ?? 0) + 1);
  }

  renderPrometheus(): string {
    const lines: string[] = [];

    lines.push(`# HELP ${WF1_METRIC_MESSAGES_TOTAL} Total WF1 messages processed.`);
    lines.push(`# TYPE ${WF1_METRIC_MESSAGES_TOTAL} counter`);
    for (const [key, value] of this.messages.entries()) {
      const [source, intent, llmPath] = key.split('|');
      lines.push(
        `${WF1_METRIC_MESSAGES_TOTAL}{source="${source}",intent="${intent}",llm_path="${llmPath}"} ${value}`,
      );
    }

    lines.push(`# HELP ${WF1_METRIC_FALLBACK_TOTAL} Total fallback responses by reason.`);
    lines.push(`# TYPE ${WF1_METRIC_FALLBACK_TOTAL} counter`);
    for (const [reason, value] of this.fallbacks.entries()) {
      lines.push(`${WF1_METRIC_FALLBACK_TOTAL}{reason="${reason}"} ${value}`);
    }

    lines.push(
      `# HELP ${WF1_METRIC_STOCK_EXACT_DISCLOSURE_TOTAL} Total responses where exact stock was intentionally disclosed.`,
    );
    lines.push(`# TYPE ${WF1_METRIC_STOCK_EXACT_DISCLOSURE_TOTAL} counter`);
    for (const [policy, value] of this.stockExactDisclosure.entries()) {
      lines.push(`${WF1_METRIC_STOCK_EXACT_DISCLOSURE_TOTAL}{policy="${policy}"} ${value}`);
    }

    lines.push(`# HELP ${WF1_METRIC_RESPONSE_LATENCY_SECONDS} WF1 response latency in seconds.`);
    lines.push(`# TYPE ${WF1_METRIC_RESPONSE_LATENCY_SECONDS} histogram`);
    for (const [key, value] of this.latencyBuckets.entries()) {
      const [intent, bucket] = key.split('|');
      lines.push(
        `${WF1_METRIC_RESPONSE_LATENCY_SECONDS}_bucket{intent="${intent}",le="${bucket}"} ${value}`,
      );
    }
    for (const [intent, value] of this.latencySum.entries()) {
      lines.push(`${WF1_METRIC_RESPONSE_LATENCY_SECONDS}_sum{intent="${intent}"} ${value}`);
    }
    for (const [intent, value] of this.latencyCount.entries()) {
      lines.push(`${WF1_METRIC_RESPONSE_LATENCY_SECONDS}_count{intent="${intent}"} ${value}`);
    }

    return `${lines.join('\n')}\n`;
  }
}

function sanitizeLabelValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}
