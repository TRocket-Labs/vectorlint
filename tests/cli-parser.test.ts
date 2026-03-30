import { describe, expect, it } from 'vitest';
import { parseCliOptions } from '../src/boundaries/cli-parser';

describe('parseCliOptions', () => {
  it('defaults print to false when omitted', () => {
    const parsed = parseCliOptions({});
    expect(parsed.print).toBe(false);
  });

  it('parses print when provided', () => {
    const parsed = parseCliOptions({ print: true });
    expect(parsed.print).toBe(true);
  });
});

