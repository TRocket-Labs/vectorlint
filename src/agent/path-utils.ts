import * as path from 'path';
import { realpathSync } from 'fs';

export function resolvePathInRepo(repositoryRoot: string, candidatePath: string): string {
  const rootRealPath = realpathSync(repositoryRoot);
  const absolute = path.isAbsolute(candidatePath)
    ? path.normalize(candidatePath)
    : path.resolve(repositoryRoot, candidatePath);
  const resolvedRealPath = realpathSync(absolute);
  const relative = path.relative(rootRealPath, resolvedRealPath);

  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Path escapes repository root: ${candidatePath}`);
  }

  return resolvedRealPath;
}

export function toRelativePath(repositoryRoot: string, absolutePath: string): string {
  const relative = path.relative(repositoryRoot, absolutePath);
  if (!relative) {
    return '.';
  }
  return relative;
}
