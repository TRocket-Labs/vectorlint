import * as os from 'node:os';
import * as path from 'node:path';
import { realpathSync } from 'node:fs';

export function expandPath(filePath: string): string {
  if (filePath === '~') return os.homedir();
  if (filePath.startsWith('~/')) return path.join(os.homedir(), filePath.slice(2));
  return filePath;
}

export function resolveToCwd(filePath: string, cwd: string): string {
  const expanded = expandPath(filePath);
  if (path.isAbsolute(expanded)) return expanded;
  return path.resolve(cwd, expanded);
}

export function isWithinRoot(absolutePath: string, root: string): boolean {
  let normalizedPath: string;
  let normalizedRoot: string;

  try {
    normalizedRoot = realpathSync(root);
    normalizedPath = realpathSync(absolutePath);
  } catch {
    normalizedRoot = path.resolve(root);
    normalizedPath = path.resolve(absolutePath);
  }

  return normalizedPath.startsWith(normalizedRoot + path.sep) ||
    normalizedPath === normalizedRoot;
}
