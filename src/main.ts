import 'reflect-metadata';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { json } from 'express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { requestIdMiddleware } from './common/middleware/request-id.middleware';
import { validateEnv, type AppEnv } from './common/config/env.validation';
import { createLogger, logger } from './common/utils/logger';
import { buildCorsOriginHandler, resolveCorsMode } from './common/http/cors-policy';

async function bootstrap(): Promise<void> {
  logger.boot();

  const validatedEnv = validateEnv(process.env);
  const nestLogLevel = validatedEnv.LOG_LEVEL === 'info' ? 'log' : validatedEnv.LOG_LEVEL;
  const app = await NestFactory.create(AppModule, {
    logger: [nestLogLevel, 'warn', 'error'],
  });

  app.use(helmet());

  app.use(
    json({
      limit: '1mb',
      verify: (req, _res, buf) => {
        (req as { rawBody?: string }).rawBody = buf.toString('utf8');
      },
    }),
  );

  app.use(requestIdMiddleware);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: () => new BadRequestException('Payload invalido.'),
    }),
  );

  app.useGlobalFilters(new HttpExceptionFilter());

  configureCors(app, validatedEnv);

  await app.listen(validatedEnv.PORT);

  createLogger('Bootstrap').info(`WF1 service listening on port ${validatedEnv.PORT}`);
}

function configureCors(app: Awaited<ReturnType<typeof NestFactory.create>>, env: AppEnv): void {
  const corsMode = resolveCorsMode(env);
  createLogger('Bootstrap').info('cors_configuration', {
    event: 'cors_configuration',
    cors_mode: corsMode,
    allowedOriginsCount: env.ALLOWED_ORIGINS.length,
  });

  app.enableCors({
    origin: buildCorsOriginHandler(env),
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'x-webhook-secret',
      'x-request-id',
      'x-turnstile-token',
      'x-shadow-mode',
      'x-external-event-id',
      'x-idempotency-key',
      'x-hub-signature-256',
    ],
    exposedHeaders: ['x-request-id'],
    credentials: true,
  });
}

bootstrap().catch((error: unknown) => {
  createLogger('Bootstrap').error(
    'Failed to bootstrap WF1 service',
    error instanceof Error ? error : undefined,
  );
  process.exit(1);
});
