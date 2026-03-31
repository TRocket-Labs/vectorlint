import * as path from 'path';

function isGlobSegment(segment: string): boolean {
  return /[*?[\]{}()!+@]/.test(segment);
}

export function resolveWithinRoot(root: string, inputPath: string): string {
  const rootResolved = path.resolve(root);
  const targetResolved = path.resolve(rootResolved, inputPath);
  const relative = path.relative(rootResolved, targetResolved);
  const outsideRoot = relative.startsWith('..') || path.isAbsolute(relative);

  if (outsideRoot) {
    throw new Error(`Path "${inputPath}" is outside repository root bounds.`);
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
