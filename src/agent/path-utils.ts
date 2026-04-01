import { realpathSync } from 'fs';
import * as path from 'path';

function isGlobSegment(segment: string): boolean {
  return /[*?[\]{}()!+@]/.test(segment);
}

export function resolveWithinRoot(root: string, inputPath: string): string {
  const rootResolved = path.resolve(root);
  const targetResolved = path.resolve(rootResolved, inputPath);

  // Lexical check: fast reject for obvious traversal (e.g. ../../etc)
  const relative = path.relative(rootResolved, targetResolved);
  const outsideRoot = relative.startsWith('..') || path.isAbsolute(relative);
  if (outsideRoot) {
    throw new Error(`Path "${inputPath}" is outside repository root bounds.`);
  }

  // Symlink check: resolve symlinks on both sides before comparing, so that
  // a symlink inside the repo pointing to an external path is caught.
  try {
    const realRoot = realpathSync(rootResolved);
    const realTarget = realpathSync(targetResolved);
    const realRelative = path.relative(realRoot, realTarget);
    if (realRelative.startsWith('..') || path.isAbsolute(realRelative)) {
      throw new Error(`Path "${inputPath}" escapes repository root via symlink.`);
    }
  } catch (err) {
    // ENOENT means the path does not yet exist — no symlinks to follow,
    // so the lexical check above is sufficient. Re-throw any other error.
    if (!(err instanceof Error && 'code' in err && (err as { code: string }).code === 'ENOENT')) {
      throw err;
    }
  }

  return targetResolved;
}

export function resolveGlobPatternWithinRoot(root: string, pattern: string): { cwd: string; pattern: string } {
  const normalizedPattern = pattern.replace(/\\/g, '/').trim();
  const segments = normalizedPattern.split('/').filter((segment) => segment.length > 0);
  const firstGlobIndex = segments.findIndex((segment) => isGlobSegment(segment));

  if (firstGlobIndex === -1) {
    const literalPath = resolveWithinRoot(root, normalizedPattern || '.');
    return {
      cwd: path.dirname(literalPath),
      pattern: path.basename(literalPath),
    };
  }

  const baseSegments = segments.slice(0, firstGlobIndex);
  const globSegments = segments.slice(firstGlobIndex);
  const basePath = baseSegments.length > 0 ? baseSegments.join('/') : '.';

  return {
    cwd: resolveWithinRoot(root, basePath),
    pattern: globSegments.join('/'),
  };
}

export function toRelativePathFromRoot(root: string, absolutePath: string): string {
  const rootResolved = path.resolve(root);
  const absoluteResolved = path.resolve(absolutePath);
  return path.relative(rootResolved, absoluteResolved).replace(/\\/g, '/');
}
