import type { ReviewScope } from './types';

const FILE_URI_RE = /^file:\/\/(?<authority>[^/]*)(?<path>\/.*)?$/;

/**
 * Lexically resolves '.' and '..' segments in a path string. Pure: performs no
 * filesystem reads. The normalization philosophy is adapted from
 * src/agent/path-utils.ts (resolveWithinRoot), which is removed in Phase 4;
 * copied here so src/review/ has no agent import and no filesystem access.
 *
 * Symlink canonicalization is intentionally NOT performed inside the contract:
 * callers are responsible for canonicalizing real files into target/context
 * URIs before building a ReviewRequest.
 */
function resolveDotSegments(input: string): string {
  const segments: string[] = [];
  for (const segment of input.split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') {
      segments.pop();
      continue;
    }
    segments.push(segment);
  }
  return (input.startsWith('/') ? '/' : '') + segments.join('/');
}

/**
 * Normalizes a review URI by resolving '.'/'..' segments in its path. file://
 * URIs are normalized structurally; other (virtual, in-memory) URIs are
 * returned as-is after dot resolution of their path-like suffix.
 */
export function normalizeReviewUri(uri: string): string {
  const match = FILE_URI_RE.exec(uri);
  if (match?.groups) {
    const authority = match.groups['authority'] ?? '';
    const rawPath = match.groups['path'] ?? '/';
    return `file://${authority}${resolveDotSegments(rawPath)}`;
  }
  return uri;
}

/**
 * Builds the on-page boundary scope (audit Finding #5) from the target URI and
 * any caller-supplied context URIs. Only these URIs are in scope; arbitrary
 * workspace files are out of scope unless the caller explicitly includes them.
 */
export function buildScope(params: {
  targetUri: string;
  contextUris?: readonly string[];
}): ReviewScope {
  const allowedUris = new Set<string>();
  allowedUris.add(normalizeReviewUri(params.targetUri));
  for (const uri of params.contextUris ?? []) {
    allowedUris.add(normalizeReviewUri(uri));
  }
  return { allowedUris };
}

/**
 * Returns true iff `uri` (after normalization) is the target or caller-supplied
 * context. Path-traversal segments are resolved before comparison, so a
 * traversal-style path cannot masquerade as an in-scope URI.
 */
export function isInScope(scope: ReviewScope, uri: string): boolean {
  return scope.allowedUris.has(normalizeReviewUri(uri));
}
