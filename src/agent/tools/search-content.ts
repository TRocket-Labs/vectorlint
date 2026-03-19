import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import fg from 'fast-glob';
import { resolveToCwd, isWithinRoot } from './path-utils.js';

const DEFAULT_LIMIT = 100;

export interface SearchContentTool {
  name: 'search_content';
  description: string;
  execute(params: {
    pattern: string;
    path?: string;
    glob?: string;
    ignoreCase?: boolean;
    context?: number;
    limit?: number;
  }): Promise<string>;
}

function hasRipgrep(): boolean {
  try {
    const result = spawnSync('rg', ['--version'], { encoding: 'utf-8' });
    return result.status === 0;
  } catch {
    return false;
  }
}

function searchWithRipgrep(
  pattern: string,
  searchRoot: string,
  opts: { glob?: string; ignoreCase?: boolean; context?: number; limit?: number }
): string {
  const args = ['--json', '--line-number', '--color=never', '--hidden'];
  if (opts.ignoreCase) args.push('--ignore-case');
  if (opts.glob) args.push('--glob', opts.glob);
  if (opts.context !== undefined) args.push('-C', String(opts.context));
  args.push(pattern, '.');

  const result = spawnSync('rg', args, {
    encoding: 'utf-8',
    maxBuffer: 10 * 1024 * 1024,
    cwd: searchRoot,
  });
  if (result.status !== 0 && result.status !== 1) return 'No matches found';

  const lines: string[] = [];
  let matchCount = 0;
  const limit = opts.limit ?? DEFAULT_LIMIT;

  for (const line of (result.stdout || '').split('\n')) {
    if (!line.trim()) continue;
    try {
      const event = JSON.parse(line) as {
        type: string;
        data?: {
          path?: { text?: string };
          line_number?: number;
          lines?: { text?: string };
        };
      };

      if (event.type === 'match' && event.data) {
        if (matchCount >= limit) break;
        const rawPath = event.data.path?.text ?? '';
        const file = path.isAbsolute(rawPath)
          ? path.relative(searchRoot, rawPath)
          : rawPath.replace(/^\.\//, '');
        const lineNum = event.data.line_number ?? 0;
        const text = (event.data.lines?.text ?? '').replace(/\n$/, '');
        lines.push(`${file}:${lineNum}: ${text}`);
        matchCount++;
      }
    } catch {
      // Skip malformed lines.
    }
  }

  if (lines.length === 0) return 'No matches found';

  const output = lines.join('\n');
  if (matchCount >= limit) {
    return `${output}\n\n[${limit} matches limit reached. Use limit=${limit * 2} for more, or refine pattern.]`;
  }

  return output;
}

function searchWithJs(
  pattern: string,
  searchRoot: string,
  opts: { glob?: string; ignoreCase?: boolean; limit?: number }
): string {
  const glob = opts.glob ?? '**/*.md';
  const files = fg.sync(glob, {
    cwd: searchRoot,
    ignore: ['**/node_modules/**', '**/.git/**'],
    absolute: true,
  });

  const regex = new RegExp(pattern, opts.ignoreCase ? 'i' : '');
  const lines: string[] = [];
  let matchCount = 0;
  const limit = opts.limit ?? DEFAULT_LIMIT;

  for (const file of files) {
    if (matchCount >= limit) break;

    try {
      const content = readFileSync(file, 'utf-8');
      const fileLines = content.split('\n');
      for (let i = 0; i < fileLines.length; i++) {
        if (matchCount >= limit) break;
        const line = fileLines[i] ?? '';
        if (regex.test(line)) {
          const relFile = path.relative(searchRoot, file);
          lines.push(`${relFile}:${i + 1}: ${line}`);
          matchCount++;
        }
      }
    } catch {
      // Skip unreadable files.
    }
  }

  if (lines.length === 0) return 'No matches found';

  const output = lines.join('\n');
  if (matchCount >= limit) {
    return `${output}\n\n[${limit} matches limit reached. Use limit=${limit * 2} for more, or refine pattern.]`;
  }

  return output;
}

export function createSearchContentTool(cwd: string): SearchContentTool {
  return {
    name: 'search_content',
    description: 'Search file contents for a pattern. Returns file:line: matchedtext format. Default glob filter: *.md. Supports regex patterns.',

    async execute({ pattern, path: searchDir, glob, ignoreCase, context, limit }) {
      const searchRoot = searchDir ? resolveToCwd(searchDir, cwd) : cwd;

      if (!isWithinRoot(searchRoot, cwd)) {
        throw new Error(`Path traversal blocked: ${searchDir} is outside the allowed root`);
      }

      const opts = { glob: glob ?? '**/*.md', ignoreCase, context, limit };
      if (hasRipgrep()) {
        return searchWithRipgrep(pattern, searchRoot, opts);
      }

      return searchWithJs(pattern, searchRoot, opts);
    },
  };
}
