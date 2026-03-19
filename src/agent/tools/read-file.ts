import { readFileSync, accessSync, constants } from 'node:fs';
import { resolveToCwd, isWithinRoot } from './path-utils.js';

const DEFAULT_MAX_LINES = 200;

export interface ReadFileTool {
  name: 'read_file';
  description: string;
  parameters: {
    path: string;
    offset?: number;
    limit?: number;
  };
  execute(params: { path: string; offset?: number; limit?: number }): Promise<string>;
}

export function createReadFileTool(cwd: string): ReadFileTool {
  return {
    name: 'read_file',
    description: `Read the text contents of a file. Use offset (1-indexed line number) and limit to paginate large files. Output is truncated to ${DEFAULT_MAX_LINES} lines with a notice showing how to continue.`,
    parameters: { path: '', offset: undefined, limit: undefined },

    async execute({ path, offset, limit }) {
      const absolutePath = resolveToCwd(path, cwd);

      if (!isWithinRoot(absolutePath, cwd)) {
        throw new Error(`Path traversal blocked: ${path} is outside the allowed root`);
      }

      try {
        accessSync(absolutePath, constants.R_OK);
      } catch {
        throw new Error(`File not readable: ${path}`);
      }

      const text = readFileSync(absolutePath, 'utf-8');
      const allLines = text.split('\n');
      const totalLines = allLines.length;

      const startIndex = offset ? Math.max(0, offset - 1) : 0;
      if (startIndex >= totalLines) {
        throw new Error(`Offset ${offset} is beyond end of file (${totalLines} lines total)`);
      }

      const effectiveLimit = limit ?? DEFAULT_MAX_LINES;
      const endIndex = Math.min(startIndex + effectiveLimit, totalLines);
      const selectedLines = allLines.slice(startIndex, endIndex);
      const output = selectedLines.join('\n');

      const startDisplay = startIndex + 1;
      const endDisplay = endIndex;

      if (endDisplay < totalLines) {
        const nextOffset = endDisplay + 1;
        return `${output}\n\n[Showing lines ${startDisplay}-${endDisplay} of ${totalLines}. Use offset=${nextOffset} to continue.]`;
      }

      return output;
    },
  };
}
