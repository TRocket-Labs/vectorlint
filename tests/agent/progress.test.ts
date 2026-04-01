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
});
