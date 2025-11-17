import fg from 'fast-glob';
import path from 'path';
import { statSync } from 'fs';

const ALLOWED_EXTS = new Set(['.md', '.txt']);

function isUnder(child: string, parent: string): boolean {
  const rel = path.relative(parent, child);
  return !!rel && !rel.startsWith('..') && !path.isAbsolute(rel);
}

export function resolveTargets(args: {
  cliArgs: string[];
  cwd: string;
  promptsPath: string;
  scanPaths: string[];
}): string[] {
  const { cliArgs, cwd, promptsPath, scanPaths } = args;
  const exclude = [] as string[];
  // Exclude prompts subtree in globbing
  const promptsRel = path.relative(cwd, promptsPath) || promptsPath;
  exclude.push(`${promptsRel.replace(/\\/g, '/')}/**`);

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
    // Use ScanPaths globs/paths
    const patterns = scanPaths.map((p) => (path.isAbsolute(p) ? p : path.resolve(cwd, p)).replace(/\\/g, '/'));
    const found = fg.sync(patterns, { dot: false, onlyFiles: true, ignore: exclude });
    files.push(...found);
  }

  // Filter out anything under promptsPath and non-allowed extensions just in case
  const dedup = new Set<string>();
  for (const f of files) {
    const ext = path.extname(f).toLowerCase();
    if (!ALLOWED_EXTS.has(ext)) continue;
    if (isUnder(f, promptsPath)) continue;
    dedup.add(path.resolve(f));
  }
  return Array.from(dedup);
}
