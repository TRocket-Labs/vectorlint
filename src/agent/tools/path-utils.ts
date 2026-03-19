import * as os from 'node:os';
import * as path from 'node:path';

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
  const normalizedPath = path.resolve(absolutePath);
  const normalizedRoot = path.resolve(root);
  return normalizedPath.startsWith(normalizedRoot + path.sep) ||
    normalizedPath === normalizedRoot;
}
