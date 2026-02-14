import { Controller, Get, Req } from '@nestjs/common';
import type { Request } from 'express';
import { createLogger } from '@/common/utils/logger';

@Controller('health')
export class HealthController {
  private readonly logger = createLogger(HealthController.name);

  @Get()
  check(@Req() req: Request): { status: 'ok'; timestamp: string } {
    this.logger.info('health_check_request', {
      event: 'health_check_request',
      request_origin: req.headers.origin ?? null,
      host: req.headers.host ?? null,
    });

    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }
}
