import { readdirSync, statSync, existsSync } from 'node:fs';
import * as path from 'node:path';
import { resolveToCwd, isWithinRoot } from './path-utils';

const DEFAULT_LIMIT = 500;

export interface ListDirectoryTool {
  name: 'list_directory';
  description: string;
  execute(params: { path?: string; limit?: number }): Promise<string>;
}

export function createListDirectoryTool(cwd: string): ListDirectoryTool {
  return {
    name: 'list_directory',
    description:
      'List the contents of a directory. Directories are shown with a trailing /. Includes dotfiles.',
    async execute({ path: dirPath, limit }) {
      await Promise.resolve();

      const absolutePath = resolveToCwd(dirPath || '.', cwd);

      if (!isWithinRoot(absolutePath, cwd)) {
        throw new Error(`Path traversal blocked: ${dirPath} is outside the allowed root`);
      }

      if (!existsSync(absolutePath)) {
        throw new Error(`Directory not found: ${dirPath}`);
      }

      const entries = readdirSync(absolutePath);
      entries.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));

      const effectiveLimit = limit ?? DEFAULT_LIMIT;
      const results: string[] = [];

      for (const entry of entries) {
        if (results.length >= effectiveLimit) break;
        const fullPath = path.join(absolutePath, entry);
        try {
          const stat = statSync(fullPath);
          results.push(stat.isDirectory() ? `${entry}/` : entry);
        } catch {
          // Skip unreadable entries.
        }
      }

      if (results.length === 0) return '(empty directory)';

      const output = results.join('\n');

      if (entries.length > effectiveLimit) {
        return `${output}\n\n[${effectiveLimit} entries limit reached. Use limit=${effectiveLimit * 2} for more.]`;
      }

      return output;
    },
  };
}
