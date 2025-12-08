import fg from 'fast-glob';
import path from 'path';
import * as fs from 'fs';
import { ALLOWED_EXTS } from '../config/constants';
import type { FilePatternConfig } from '../boundaries/file-section-parser';

function isUnder(filePath: string, dir: string): boolean {
  const relative = path.relative(dir, filePath);
  return !relative.startsWith('..') && !path.isAbsolute(relative);
}

export function resolveTargets(args: {
  cliArgs: string[];
  cwd: string;
  rulesPath: string;
  scanPaths: FilePatternConfig[]; // Changed type from string[] to FilePatternConfig[]
  configDir: string;
}): string[] {
  const { cliArgs, cwd, rulesPath, scanPaths, configDir } = args;
  const exclude = [] as string[];
  // Exclude rules subtree in globbing
  const rulesRel = path.relative(cwd, rulesPath) || rulesPath;
  exclude.push(`${rulesRel.replace(/\\/g, '/')}/**`);

  const files: string[] = [];
  if (cliArgs.length > 0) {
    // CLI args: resolve each argument as before
    for (const arg of cliArgs) { // Changed input to arg
      const absArg = path.resolve(cwd, arg); // Changed abs to absArg and input to arg
      if (fs.existsSync(absArg)) { // Changed try/catch statSync to fs.existsSync
        const stat = fs.statSync(absArg); // Changed st to stat and statSync to fs.statSync
        if (stat.isDirectory()) {
          const found = fg.sync(`${absArg.replace(/\\/g, '/')}/**/*`, { dot: false, onlyFiles: true, ignore: exclude }); // Changed glob pattern and abs to absArg
          files.push(...found);
        } else if (stat.isFile()) {
          files.push(absArg); // Removed extension check and abs to absArg
        }
      } else {
        // Try as glob
        const found = fg.sync(arg.replace(/\\/g, '/'), { dot: false, onlyFiles: true, ignore: exclude }); // Added new else block for glob
        files.push(...found);
      }
    }
  } else {
    // Extract patterns from scanPaths
    const patterns = scanPaths
      .map((section) => section.pattern) // Added .map((section) => section.pattern)
      .map((p) => (path.isAbsolute(p) ? p : path.resolve(configDir, p)).replace(/\\/g, '/'));
    const found = fg.sync(patterns, { dot: false, onlyFiles: true, ignore: exclude });
    files.push(...found);
  }

  // Filter out anything under rulesPath and non-allowed extensions just in case
  const dedup = new Set<string>();
  for (const f of files) {
    const ext = path.extname(f).toLowerCase();
    if (!ALLOWED_EXTS.has(ext)) continue;
    if (isUnder(f, rulesPath)) continue;
    dedup.add(path.resolve(f));
  }
  return Array.from(dedup);
}
