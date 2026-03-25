import fg from 'fast-glob';
import { existsSync, readFileSync } from 'node:fs';
import * as path from 'node:path';
import { resolveToCwd, isWithinRoot } from './path-utils.js';

const DEFAULT_LIMIT = 1000;
const DEFAULT_IGNORES = ['**/node_modules/**', '**/.git/**'];

function normalizeGitignorePattern(pattern: string): string {
  const normalized = pattern.replace(/\\/g, '/').replace(/^\/+/, '');
  if (normalized.endsWith('/')) {
    return `${normalized}**`;
  }
  return normalized;
}

function loadRootGitignorePatterns(cwd: string): string[] {
  const gitignorePath = path.join(cwd, '.gitignore');
  if (!existsSync(gitignorePath)) {
    return [];
  }

  const raw = readFileSync(gitignorePath, 'utf-8');
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .filter((line) => !line.startsWith('#'))
    .filter((line) => !line.startsWith('!'))
    .map(normalizeGitignorePattern);
}

export interface SearchFilesTool {
  name: 'search_files';
  description: string;
  execute(params: { pattern: string; path?: string; limit?: number }): Promise<string>;
}

export function createSearchFilesTool(cwd: string): SearchFilesTool {
  const gitignorePatterns = loadRootGitignorePatterns(cwd);

  return {
    name: 'search_files',
    description: 'Find files by glob pattern. Returns paths relative to repo root. Respects .gitignore when present. Examples: **/*.md, docs/*.md, src/**/*.ts',

    async execute({ pattern, path: searchDir, limit }) {
      const searchRoot = searchDir ? resolveToCwd(searchDir, cwd) : cwd;

      if (!isWithinRoot(searchRoot, cwd)) {
        throw new Error(`Path traversal blocked: ${searchDir} is outside the allowed root`);
      }

      const searchPrefix = searchDir ? path.relative(cwd, searchRoot).replace(/\\/g, '/') : '';
      const scopedPattern = searchPrefix ? path.posix.join(searchPrefix, pattern) : pattern;
      const effectiveLimit = limit ?? DEFAULT_LIMIT;
      const matches = await fg(scopedPattern, {
        cwd,
        ignore: [...DEFAULT_IGNORES, ...gitignorePatterns],
        onlyFiles: true,
        followSymbolicLinks: false,
      });

      if (matches.length === 0) {
        return 'No files found matching pattern';
      }

      const limited = matches.slice(0, effectiveLimit);
      const output = limited.join('\n');
      if (matches.length > effectiveLimit) {
        return `${output}\n\n[${effectiveLimit} results limit reached. Refine your pattern for more specific results.]`;
      }

      return output;
    },
  };
}
