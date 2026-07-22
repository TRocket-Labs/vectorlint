import { describe, expect, it } from 'vitest';
import { buildScope, isInScope, normalizeReviewUri } from '../../src/review';

describe('review boundary', () => {
  const scope = buildScope({
    targetUri: 'file:///repo/docs/guide.md',
    contextUris: ['file:///repo/docs/glossary.md'],
  });

  it('target is always in scope', () => {
    expect(isInScope(scope, 'file:///repo/docs/guide.md')).toBe(true);
  });

  it('caller-supplied context uri is in scope', () => {
    expect(isInScope(scope, 'file:///repo/docs/glossary.md')).toBe(true);
  });

  it('arbitrary workspace file is NOT in scope', () => {
    expect(isInScope(scope, 'file:///repo/src/index.ts')).toBe(false);
  });

  it('rejects path traversal that escapes the target', () => {
    expect(isInScope(scope, 'file:///repo/docs/../src/index.ts')).toBe(false);
  });

  it('normalizes traversal that resolves back onto an in-scope uri', () => {
    expect(isInScope(scope, 'file:///repo/docs/sub/../guide.md')).toBe(true);
  });
});

describe('normalizeReviewUri', () => {
  it('resolves dot segments in file uris', () => {
    expect(normalizeReviewUri('file:///repo/a/../b/./c.md')).toBe('file:///repo/b/c.md');
  });

  it('preserves authority', () => {
    expect(normalizeReviewUri('file://host/x/../y.md')).toBe('file://host/y.md');
  });
});
