import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Pool } from 'pg';

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Missing required env: ${name}`);
  }

  return value.trim();
}

export function readBooleanEnv(name: string, fallback: boolean): boolean {
  const value = process.env[name];
  if (typeof value !== 'string') {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === 'true' || normalized === '1' || normalized === 'yes') {
    return true;
  }
  if (normalized === 'false' || normalized === '0' || normalized === 'no') {
    return false;
  }

  return fallback;
}

export function readNumberEnv(name: string, fallback: number): number {
  const value = process.env[name];
  if (typeof value !== 'string' || value.trim().length === 0) {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid numeric env: ${name}=${value}`);
  }

  return parsed;
}

export function readStringEnv(name: string, fallback: string): string {
  const value = process.env[name];
  if (typeof value !== 'string' || value.trim().length === 0) {
    return fallback;
  }

  return value.trim();
}

export function createAnalyticsPool(): Pool {
  const connectionString =
    process.env.CHATBOT_DB_TEST_URL?.trim() || requireEnv('CHATBOT_DB_URL');

  return new Pool({
    connectionString,
    max: 2,
  });
}

export async function writeLocalReport(
  name: string,
  payload: Record<string, unknown>,
): Promise<string> {
  const outDir = resolve(process.cwd(), 'docs/reports/local');
  const outPath = resolve(outDir, `${name}-${Date.now()}.json`);
  await mkdir(outDir, { recursive: true });
  await writeFile(outPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return outPath;
}

