import { describe, expect, it, vi } from 'vitest';

const MOCK_CREATE_LOGGER = vi.hoisted(() => vi.fn(() => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
})));
const MOCK_CONSOLE_TRANSPORT = vi.hoisted(() => vi.fn());
const MOCK_COMBINE = vi.hoisted(() => vi.fn(() => 'combined-format'));
const MOCK_COLORIZE = vi.hoisted(() => vi.fn(() => 'colorize-format'));
const MOCK_TIMESTAMP = vi.hoisted(() => vi.fn(() => 'timestamp-format'));
const MOCK_PRINTF = vi.hoisted(() => vi.fn(() => 'printf-format'));

vi.mock('winston', () => ({
  default: {
    createLogger: MOCK_CREATE_LOGGER,
    format: {
      combine: MOCK_COMBINE,
      colorize: MOCK_COLORIZE,
      timestamp: MOCK_TIMESTAMP,
      printf: MOCK_PRINTF,
    },
    transports: {
      Console: MOCK_CONSOLE_TRANSPORT,
    },
  },
}));

import { LOG_LEVELS } from '../src/logging/logger';
import { createWinstonLogger } from '../src/logging/winston-logger';

describe('createWinstonLogger', () => {
  it('routes all runtime log levels to stderr', () => {
    createWinstonLogger({ level: 'debug' });

    expect(MOCK_CONSOLE_TRANSPORT).toHaveBeenCalledWith({
      stderrLevels: [...LOG_LEVELS],
    });
  });
});
