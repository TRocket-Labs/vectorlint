import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProgressReporter } from '../src/output/progress-reporter';

describe('ProgressReporter', () => {
  const originalIsTTY = Object.getOwnPropertyDescriptor(process.stderr, 'isTTY');

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    if (originalIsTTY) {
      Object.defineProperty(process.stderr, 'isTTY', originalIsTTY);
    }
  });

  it('writes spinner frames and a final done line when stderr is a TTY', () => {
    Object.defineProperty(process.stderr, 'isTTY', {
      configurable: true,
      value: true,
    });
    const writeSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);

    const reporter = new ProgressReporter({
      runningText: '◆ reviewing.....',
      doneText: '◆ done',
      intervalMs: 10,
    });

    reporter.start();
    vi.advanceTimersByTime(35);
    reporter.stop();

    const output = writeSpy.mock.calls.map((call) => String(call[0])).join('');
    expect(output).toContain('◆ reviewing.....');
    expect(output).toContain('◆ done in <1s');
    expect(output).toContain('\r\x1b[2K');
  });

  it('emits nothing when stderr is not a TTY', () => {
    Object.defineProperty(process.stderr, 'isTTY', {
      configurable: true,
      value: false,
    });
    const writeSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);

    const reporter = new ProgressReporter({ intervalMs: 10 });
    reporter.start();
    vi.advanceTimersByTime(35);
    reporter.stop();

    expect(writeSpy).not.toHaveBeenCalled();
  });
});
