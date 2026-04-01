import winston from 'winston';
import { LOG_LEVELS, type Logger, type LogLevel, type LogMeta } from './logger';

export interface WinstonLoggerOptions {
  level?: LogLevel;
}

class WinstonLoggerAdapter implements Logger {
  constructor(private readonly logger: winston.Logger) {}

  debug(message: string, meta?: LogMeta): void {
    this.logger.debug(message, meta);
  }

  info(message: string, meta?: LogMeta): void {
    this.logger.info(message, meta);
  }

  warn(message: string, meta?: LogMeta): void {
    this.logger.warn(message, meta);
  }

  error(message: string, meta?: LogMeta): void {
    this.logger.error(message, meta);
  }
}

function serializeLogMeta(meta: Record<string, unknown>): string {
  try {
    return JSON.stringify(meta);
  } catch {
    return '[unserializable metadata]';
  }
}

export function createWinstonLogger(options: WinstonLoggerOptions = {}): Logger {
  const logger = winston.createLogger({
    level: options.level ?? 'info',
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.timestamp(),
      winston.format.printf(({ timestamp, level, message, ...meta }) => {
        const hasMeta = Object.keys(meta).length > 0;
        const serializedMeta = hasMeta ? serializeLogMeta(meta) : '';
        const metaText = hasMeta && serializedMeta ? ` ${serializedMeta}` : '';
        return `${String(timestamp)} ${String(level)}: ${String(message)}${metaText}`;
      })
    ),
    transports: [
      new winston.transports.Console({
        stderrLevels: [...LOG_LEVELS],
      }),
    ],
  });

  return new WinstonLoggerAdapter(logger);
}
