import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { validateEnv } from './common/config/env.validation';
import { HealthModule } from './modules/health/health.module';
import { Wf1Module } from './modules/wf1/wf1.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60_000,
        limit: 30,
      },
    ]),
    HealthModule,
    Wf1Module,
  ],
})
export class AppModule {}
