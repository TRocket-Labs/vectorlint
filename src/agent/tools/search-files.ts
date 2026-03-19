import fg from 'fast-glob';
import { resolveToCwd, isWithinRoot } from './path-utils';

const DEFAULT_LIMIT = 1000;

export interface SearchFilesTool {
  name: 'search_files';
  description: string;
  execute(params: { pattern: string; path?: string; limit?: number }): Promise<string>;
}

export function createSearchFilesTool(cwd: string): SearchFilesTool {
  return {
    name: 'search_files',
    description:
      'Find files by glob pattern. Returns paths relative to the search root. Examples: **/*.md, docs/*.md, src/**/*.ts',
    async execute({ pattern, path: searchDir, limit }) {
      const searchRoot = searchDir ? resolveToCwd(searchDir, cwd) : cwd;

      if (!isWithinRoot(searchRoot, cwd)) {
        throw new Error(`Path traversal blocked: ${searchDir} is outside the allowed root`);
      }

      const effectiveLimit = limit ?? DEFAULT_LIMIT;
      const matches = await fg(pattern, {
        cwd: searchRoot,
        ignore: ['**/node_modules/**', '**/.git/**'],
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
