import winston from 'winston';
import type { Logger, LogMeta } from './logger';

export interface WinstonLoggerOptions {
  level?: string;
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

export function createWinstonLogger(options: WinstonLoggerOptions = {}): Logger {
  const logger = winston.createLogger({
    level: options.level ?? 'info',
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.timestamp(),
      winston.format.printf(({ timestamp, level, message, ...meta }) => {
        const serializedMeta = JSON.stringify(meta);
        const metaText = Object.keys(meta).length > 0 && serializedMeta ? ` ${serializedMeta}` : '';
        return `${String(timestamp)} ${String(level)}: ${String(message)}${metaText}`;
      })
    ),
    transports: [new winston.transports.Console()],
  });

  return new WinstonLoggerAdapter(logger);
}
