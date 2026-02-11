import { Controller, Get, Header } from '@nestjs/common';
import { PrometheusMetricsAdapter } from '../infrastructure/adapters/metrics/prometheus-metrics.adapter';

@Controller('internal')
export class MetricsController {
  constructor(private readonly metrics: PrometheusMetricsAdapter) {}

  @Get('metrics')
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  render(): string {
    return this.metrics.renderPrometheus();
  }
}

