import 'reflect-metadata';
import { BadRequestException, Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { json } from 'express';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { requestIdMiddleware } from './common/middleware/request-id.middleware';
import { validateEnv, type AppEnv } from './common/config/env.validation';

async function bootstrap(): Promise<void> {
  const validatedEnv = validateEnv(process.env);
  const app = await NestFactory.create(AppModule, {
    logger: [validatedEnv.LOG_LEVEL, 'warn', 'error'],
  });

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

  Logger.log(`WF1 service listening on port ${validatedEnv.PORT}`, 'Bootstrap');
}

function configureCors(app: Awaited<ReturnType<typeof NestFactory.create>>, env: AppEnv): void {
  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (error: Error | null, allow?: boolean) => void,
    ) => {
      if (!origin || env.ALLOWED_ORIGINS.length === 0 || env.ALLOWED_ORIGINS.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error('Origin not allowed by CORS'));
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    credentials: true,
  });
}

bootstrap().catch((error: unknown) => {
  const logger = new Logger('Bootstrap');
  logger.error('Failed to bootstrap WF1 service', error instanceof Error ? error.stack : error);
  process.exit(1);
});
