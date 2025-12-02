import fg from 'fast-glob';
import path from 'path';
import { statSync } from 'fs';

const ALLOWED_EXTS = new Set(['.md', '.txt', '.mdx']);

function isUnder(child: string, parent: string): boolean {
  const rel = path.relative(parent, child);
  return !!rel && !rel.startsWith('..') && !path.isAbsolute(rel);
}

export function resolveTargets(args: {
  cliArgs: string[];
  cwd: string;
  evalsPath: string;
  scanPaths: string[];
  configDir: string;
}): string[] {
  const { cliArgs, cwd, evalsPath, scanPaths, configDir } = args;
  const exclude = [] as string[];
  // Exclude evals subtree in globbing
  const evalsRel = path.relative(cwd, evalsPath) || evalsPath;
  exclude.push(`${evalsRel.replace(/\\/g, '/')}/**`);

  const files: string[] = [];
  if (cliArgs.length > 0) {
    // Resolve each CLI arg
    for (const input of cliArgs) {
      const abs = path.isAbsolute(input) ? input : path.resolve(cwd, input);
      let st;
      try { st = statSync(abs); } catch { continue; }
      if (st.isDirectory()) {
        const found = fg.sync([`${abs.replace(/\\/g, '/')}/**/*.{md,txt}`], { dot: false, onlyFiles: true, ignore: exclude });
        files.push(...found);
      } else if (st.isFile()) {
        const ext = path.extname(abs).toLowerCase();
        if (ALLOWED_EXTS.has(ext)) files.push(abs);
      }
    }
  } else {
    // Use ScanPaths globs/paths (resolved relative to config directory)
    const patterns = scanPaths.map((p) => (path.isAbsolute(p) ? p : path.resolve(configDir, p)).replace(/\\/g, '/'));
    const found = fg.sync(patterns, { dot: false, onlyFiles: true, ignore: exclude });
    files.push(...found);
  }

  // Filter out anything under evalsPath and non-allowed extensions just in case
  const dedup = new Set<string>();
  for (const f of files) {
    const ext = path.extname(f).toLowerCase();
    if (!ALLOWED_EXTS.has(ext)) continue;
    if (isUnder(f, evalsPath)) continue;
    dedup.add(path.resolve(f));
  }
  return Array.from(dedup);
}
