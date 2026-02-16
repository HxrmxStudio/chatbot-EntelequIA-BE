import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import { PG_POOL } from '../../application/ports/tokens';

@Injectable()
export class PgPoolProvider implements OnModuleDestroy {
  readonly pool: Pool;

  constructor(private readonly configService: ConfigService) {
    const connectionString = this.configService.get<string>('CHATBOT_DB_URL');
    const ipFamily = this.configService.get<4 | 6 | undefined>('CHATBOT_DB_IP_FAMILY');
    this.pool = new Pool({
      connectionString,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
      ...(ipFamily ? { family: ipFamily } : {}),
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}

export const pgPoolFactory = {
  provide: PG_POOL,
  useFactory: (provider: PgPoolProvider) => provider.pool,
  inject: [PgPoolProvider],
};
