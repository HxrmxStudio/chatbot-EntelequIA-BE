import { redactSensitiveData } from './pii-redaction';

/**
 * Backend logger aligned with chatbot-widget FE logger.
 * Same style: indicators, timestamp, meta box, security wrapper, error stack.
 * Production: JSON lines. Development: styled output with ANSI colors.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type LogType = 'system' | 'socket' | 'http' | 'auth' | 'chat' | 'security';

export interface LogMeta {
  type?: LogType;
  method?: string;
  duration?: number;
  context?: string;
  [key: string]: unknown;
}

const LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const INDICATORS: Record<LogLevel | LogType, string> = {
  error: '🔴 [CRITICAL]',
  warn: '🟡 [WARNING!]',
  info: '🟢 [SYSTEM>>]',
  debug: '⚪ [<DEBUG/>]',
  socket: '🔮 [◄SOCKET►]',
  http: '🌐 [◄HTTP►]',
  auth: '🔐 [AUTH::OK]',
  security: '🚨 [!BREACH!]',
  chat: '💬 [CHAT]',
  system: '⚡ [SYSTEM]',
};

const ANSI = {
  reset: '\x1b[0m',
  gray: '\x1b[90m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
};

const BANNER = `
███████╗███╗   ██╗████████╗███████╗██╗     ███████╗ ██████╗ ██╗   ██╗██╗ █████╗ 
██╔════╝████╗  ██║╚══██╔══╝██╔════╝██║     ██╔════╝██╔═══██╗██║   ██║██║██╔══██╗
█████╗  ██╔██╗ ██║   ██║   █████╗  ██║     █████╗  ██║   ██║██║   ██║██║███████║
██╔══╝  ██║╚██╗██║   ██║   ██╔══╝  ██║     ██╔══╝  ██║▄▄ ██║██║   ██║██║██╔══██║
███████╗██║ ╚████║   ██║   ███████╗███████╗███████╗╚██████╔╝╚██████╔╝██║██║  ██║
╚══════╝╚═╝  ╚═══╝   ╚═╝   ╚══════╝╚══════╝╚══════╝ ╚══▀▀═╝  ╚═════╝ ╚═╝╚═╝  ╚═╝
`;

function printBanner(): void {
  console.log(
    `${ANSI.green}${ANSI.bold}${BANNER}${ANSI.reset}` +
      `${ANSI.cyan}                                                              by HxrmX.${ANSI.reset}\n` +
      `${ANSI.gray}${'═'.repeat(80)}${ANSI.reset}\n` +
      `${ANSI.green}${ANSI.bold}> SYSTEM INITIALIZED // ${new Date().toISOString()}${ANSI.reset}\n` +
      `${ANSI.gray}${'═'.repeat(80)}${ANSI.reset}\n`,
  );
}

function getLogLevel(): LogLevel {
  const raw = process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'production' ? 'info' : 'debug');
  if (raw === 'log') return 'info';
  return raw in LEVELS ? (raw as LogLevel) : 'info';
}

function shouldLog(level: LogLevel): boolean {
  return LEVELS[level] >= LEVELS[getLogLevel()];
}

function getTimestamp(): string {
  const now = new Date();
  return (
    now.toTimeString().split(' ')[0] +
    '.' +
    String(now.getMilliseconds()).padStart(3, '0')
  );
}

function formatMetaForDisplay(meta?: LogMeta): string {
  const safeMeta = sanitizeMeta(meta);
  if (
    !safeMeta ||
    Object.keys(safeMeta).filter((k) => k !== 'type' && k !== 'method').length === 0
  ) {
    return '';
  }
  const filtered = { ...safeMeta };
  delete filtered.type;
  delete filtered.method;
  if (Object.keys(filtered).length === 0) return '';
  return (
    '\n┌─[DATA]\n│ ' +
    JSON.stringify(filtered, null, 2).split('\n').join('\n│ ') +
    '\n└────────'
  );
}

function formatMetaForPayload(meta?: LogMeta): Record<string, unknown> {
  const safeMeta = sanitizeMeta(meta);
  if (!safeMeta || Object.keys(safeMeta).length === 0) return {};
  return { ...safeMeta };
}

function sanitizeMeta(meta?: LogMeta): LogMeta | undefined {
  if (!meta) {
    return undefined;
  }

  const redacted = redactSensitiveData(meta);
  if (typeof redacted !== 'object' || redacted === null || Array.isArray(redacted)) {
    return undefined;
  }

  return redacted as LogMeta;
}

function log(level: LogLevel, message: string, meta?: LogMeta, context?: string): void {
  if (!shouldLog(level)) return;

  const type = meta?.type;
  const indicator = type ? INDICATORS[type] : INDICATORS[level];
  const methodPrefix = meta?.method ? `[${meta.method}] ` : '';
  const metaStr = formatMetaForDisplay(meta);
  const ctx = context ? `[${context}] ` : '';
  const payload = {
    timestamp: getTimestamp(),
    level,
    indicator,
    message,
    ...(context && { context }),
    ...formatMetaForPayload(meta),
  };

  const isProd = process.env.NODE_ENV === 'production';

  if (isProd) {
    const line = JSON.stringify(payload);
    if (level === 'error') process.stderr.write(line + '\n');
    else process.stdout.write(line + '\n');
    return;
  }

  const timeStyle = ANSI.gray;
  const msgStyle = level === 'error' ? ANSI.red : '';
  const out = `${timeStyle}[${getTimestamp()}]${ANSI.reset} ${indicator} ${msgStyle}${ctx}${methodPrefix}${message}${metaStr}${ANSI.reset}`;

  switch (level) {
    case 'error':
      console.error(out);
      break;
    case 'warn':
      console.warn(out);
      break;
    default:
      console.log(out);
  }
}

function createLogFn(level: LogLevel, context?: string) {
  return (message: string, meta?: LogMeta) => log(level, message, meta, context);
}

function createTypedLogFn(
  level: LogLevel,
  type: LogType,
  context?: string,
) {
  return (message: string, meta?: Omit<LogMeta, 'type'>) =>
    log(level, message, { ...meta, type }, context);
}

export interface Logger {
  debug: (message: string, meta?: LogMeta) => void;
  info: (message: string, meta?: LogMeta) => void;
  warn: (message: string, meta?: LogMeta) => void;
  error: (message: string, error?: Error, meta?: LogMeta) => void;
  socket: (message: string, meta?: Omit<LogMeta, 'type'>) => void;
  http: (message: string, meta?: Omit<LogMeta, 'type'>) => void;
  auth: (message: string, meta?: Omit<LogMeta, 'type'>) => void;
  chat: (message: string, meta?: Omit<LogMeta, 'type'>) => void;
  security: (message: string, meta?: Omit<LogMeta, 'type'>) => void;
  performance: (operation: string, startTime: number, meta?: Omit<LogMeta, 'type' | 'duration'>) => void;
  boot: () => void;
  isDebugEnabled: () => boolean;
}

function createLoggerImpl(context?: string): Logger {
  const isDev = process.env.NODE_ENV !== 'production';

  return {
    debug: createLogFn('debug', context),
    info: createLogFn('info', context),
    warn: createLogFn('warn', context),
    error: (message: string, error?: Error, meta?: LogMeta) => {
      const errorMeta: LogMeta = {
        ...meta,
        errorName: error?.name,
        errorMessage: error?.message,
        ...(isDev && error?.stack && { stack: error.stack }),
      };
      log('error', message, errorMeta, context);
      if (isDev && error?.stack) {
        const stackBox =
          `${ANSI.red}╔══ STACK TRACE ══╗${ANSI.reset}\n` +
          error.stack
            .split('\n')
            .map((l, i) =>
              i === 0
                ? `${ANSI.red}║${ANSI.reset} ${l}`
                : `${ANSI.red}║${ANSI.reset}  ├─ ${l.trim()}`,
            )
            .join('\n') +
          `\n${ANSI.red}╚═════════════════╝${ANSI.reset}`;
        console.error(stackBox);
      }
    },
    socket: createTypedLogFn('debug', 'socket', context),
    http: createTypedLogFn('debug', 'http', context),
    auth: createTypedLogFn('info', 'auth', context),
    chat: createTypedLogFn('info', 'chat', context),
    security: (message: string, meta?: Omit<LogMeta, 'type'>) => {
      if (process.env.NODE_ENV !== 'production') {
        console.log(`${ANSI.red}${'▓'.repeat(60)}${ANSI.reset}`);
      }
      log('warn', `⚠⚠⚠ ${message} ⚠⚠⚠`, { ...meta, type: 'security' }, context);
      if (process.env.NODE_ENV !== 'production') {
        console.log(`${ANSI.red}${'▓'.repeat(60)}${ANSI.reset}`);
      }
    },
    performance: (operation: string, startTime: number, meta?: Omit<LogMeta, 'type' | 'duration'>) => {
      if (!shouldLog('debug')) return;
      const duration = Date.now() - startTime;
      log('debug', `Performance: ${operation}`, { ...meta, duration, type: 'system' }, context);
    },
    boot: (): void => {
      if (process.env.NODE_ENV === 'production') return;
      printBanner();
      const sequence = [
        '✓ Initializing core systems...',
        '✓ Loading WF1 module...',
        '✓ Establishing DB connection...',
        '✓ System ready for operations',
      ];
      sequence.forEach((msg, i) => {
        setTimeout(() => logger.info(msg, { type: 'system' }), i * 150);
      });
    },
    isDebugEnabled: () => shouldLog('debug'),
  };
}

export const logger: Logger = createLoggerImpl();

export function createLogger(context: string): Logger {
  return createLoggerImpl(context);
}
