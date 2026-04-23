import { afterEach, describe, expect, it, vi } from 'vitest';
import { AgentProgressReporter } from '../../src/agent/progress';

describe('agent progress reporter', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('animates spinner frames independently of content changes while active', () => {
    vi.useFakeTimers();

    const writeSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);

    const reporter = new AgentProgressReporter(true);
    reporter.startFile('README.md', 'Repetition');
    reporter.showVisibleToolStart({
      toolName: 'lint',
      path: 'README.md',
      ruleName: 'Repetition',
      ruleText: '# Repetition Flag any instance where the same wording repeats',
    });

    const initialWrites = writeSpy.mock.calls.length;
    vi.advanceTimersByTime(250);

    expect(writeSpy.mock.calls.length).toBeGreaterThan(initialWrites);

    reporter.finishRun();
  });

  it('is a no-op when disabled', () => {
    const writeSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);

    const reporter = new AgentProgressReporter(false);
    reporter.startFile('README.md', 'Repetition');
    reporter.finishRun();

    expect(writeSpy).not.toHaveBeenCalled();
  });

  it.each([
    { elapsedMs: 0, expected: 'Completed review in 0s.' },
    { elapsedMs: 60_000, expected: 'Completed review in 1m 0s.' },
    { elapsedMs: 3_600_000, expected: 'Completed review in 1h 0m 0s.' },
  ])('formats elapsed time boundaries for $expected', ({ elapsedMs, expected }) => {
    vi.useFakeTimers();

    const writeSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);

    const reporter = new AgentProgressReporter(true);
    reporter.startFile('README.md', 'Repetition');

    vi.advanceTimersByTime(elapsedMs);
    reporter.finishRun();

    const output = writeSpy.mock.calls.map((call) => String(call[0])).join('');
    expect(output).toContain(expected);
  });

  it('formats the completion footer with elapsed time', () => {
    vi.useFakeTimers();

    const writeSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);

    const reporter = new AgentProgressReporter(true);
    reporter.startFile('README.md', 'Repetition');

    vi.advanceTimersByTime(85_000);
    reporter.finishRun();

    const output = writeSpy.mock.calls.map((call) => String(call[0])).join('');
    expect(output).toContain('Completed review in 1m 25s.');
  });

  it('formats a failed footer when the run ends with errors', () => {
    vi.useFakeTimers();

    const writeSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);

    const reporter = new AgentProgressReporter(true);
    reporter.startFile('README.md', 'Repetition');

    vi.advanceTimersByTime(85_000);
    reporter.finishRun('failed');

    const output = writeSpy.mock.calls.map((call) => String(call[0])).join('');
    expect(output).toContain('Review failed after 1m 25s.');
  });
});
