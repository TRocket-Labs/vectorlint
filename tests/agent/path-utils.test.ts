import { describe, it, expect } from 'vitest';
import { resolveToCwd, isWithinRoot } from '../../src/agent/tools/path-utils';

describe('resolveToCwd', () => {
  it('resolves relative paths against cwd', () => {
    const result = resolveToCwd('docs/quickstart.md', '/repo');
    expect(result).toBe('/repo/docs/quickstart.md');
  });

  it('returns absolute paths unchanged', () => {
    const result = resolveToCwd('/absolute/path.md', '/repo');
    expect(result).toBe('/absolute/path.md');
  });

  it('expands ~ to home directory', () => {
    const result = resolveToCwd('~/file.md', '/repo');
    expect(result).toContain('file.md');
    expect(result).not.toContain('~');
  });
});

describe('isWithinRoot', () => {
  it('returns true for path within root', () => {
    expect(isWithinRoot('/repo/docs/file.md', '/repo')).toBe(true);
  });

  it('returns false for path outside root', () => {
    expect(isWithinRoot('/etc/passwd', '/repo')).toBe(false);
  });

  it('blocks traversal attempts', () => {
    expect(isWithinRoot('/repo/../etc/passwd', '/repo')).toBe(false);
  });
});
