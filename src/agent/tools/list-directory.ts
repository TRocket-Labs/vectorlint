import { constants } from 'node:fs';
import { access, readdir, stat } from 'node:fs/promises';
import * as path from 'node:path';
import { resolveToCwd, isWithinRoot } from './path-utils.js';

const DEFAULT_LIMIT = 500;

export interface ListDirectoryTool {
  name: 'list_directory';
  description: string;
  execute(params: { path?: string; limit?: number }): Promise<string>;
}

export function createListDirectoryTool(cwd: string): ListDirectoryTool {
  return {
    name: 'list_directory',
    description: 'List the contents of a directory. Directories are shown with a trailing /. Includes dotfiles.',

    async execute({ path: dirPath, limit }) {
      const absolutePath = resolveToCwd(dirPath || '.', cwd);

      if (!isWithinRoot(absolutePath, cwd)) {
        throw new Error(`Path traversal blocked: ${dirPath} is outside the allowed root`);
      }

      try {
        await access(absolutePath, constants.F_OK);
      } catch {
        throw new Error(`Directory not found: ${dirPath}`);
      }

      const entries = await readdir(absolutePath);
      entries.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));

      const effectiveLimit = limit ?? DEFAULT_LIMIT;
      const resolvedEntries = await Promise.all(entries.map(async (entry) => {
        const fullPath = path.join(absolutePath, entry);
        try {
          const entryStat = await stat(fullPath);
          return entryStat.isDirectory() ? `${entry}/` : entry;
        } catch {
          return null;
        }
      }));

      const results = resolvedEntries
        .filter((entry): entry is string => entry !== null)
        .slice(0, effectiveLimit);

      if (results.length === 0) return '(empty directory)';

      const output = results.join('\n');
      const wasTruncated = results.length >= effectiveLimit && entries.length > results.length;
      if (wasTruncated) {
        return `${output}\n\n[${effectiveLimit} entries limit reached. Use limit=${effectiveLimit * 2} for more.]`;
      }

      return output;
    },
  };
}
