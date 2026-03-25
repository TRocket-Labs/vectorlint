# Agentic Capabilities Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an agent mode to the VectorLint CLI that evaluates documentation cross-document using a read-only tool suite and a Vercel AI SDK agent loop.

**Architecture:** In agent mode, every rule is sent to the Agent Executor — no pre-classification step. The agent acts as a senior technical writer with a tool belt: it calls the `lint` tool for per-page evaluation and uses file tools (`read_file`, `search_content`, `search_files`, `list_directory`) for cross-file evidence. One agent invocation per rule, all run in parallel. Lint mode (default) is unchanged.

**Tech Stack:** TypeScript ESM, Zod, Vercel AI SDK (`ai` package — already installed), `fast-glob` (already installed), Vitest, existing `LLMProvider`/`VercelAIProvider` patterns.

---

## File Structure

**New files:**
| File | Responsibility |
|---|---|
| `src/agent/types.ts` | `AgentFinding`, `AgentRunResult` types and Zod schemas |
| `src/agent/tools/path-utils.ts` | `resolveToCwd` — resolve paths relative to cwd, block traversal outside root |
| `src/agent/tools/read-file.ts` | `createReadFileTool` — read text files with offset/limit pagination |
| `src/agent/tools/search-content.ts` | `createSearchContentTool` — grep across files via ripgrep |
| `src/agent/tools/search-files.ts` | `createSearchFilesTool` — glob file search via fast-glob |
| `src/agent/tools/list-directory.ts` | `createListDirectoryTool` — list directory contents |
| `src/agent/tools/lint-tool.ts` | `createLintTool` — run per-page lint as a sub-tool |
| `src/agent/tools/index.ts` | Re-export all tool factory functions |
| `src/agent/agent-executor.ts` | `runAgentExecutor` — Vercel AI SDK tool-use loop per rule |
| `src/agent/merger.ts` | `collectAgentFindings` — flatten agent results into findings list |

**Modified files:**
| File | Change |
|---|---|
| `src/cli/commands.ts` | Add `--mode` flag |
| `src/cli/orchestrator.ts` | Wire agent executor when `--mode agent` |
| `src/output/reporter.ts` | Render agent findings in `line` output |
| `src/output/json-formatter.ts` | Add `source` field to JSON output |

**New test files:**
| File | Tests |
|---|---|
| `tests/agent/types.test.ts` | Schema validation for `AgentFinding` |
| `tests/agent/path-utils.test.ts` | Path resolution and traversal blocking |
| `tests/agent/read-file.test.ts` | Read tool: content, pagination, truncation |
| `tests/agent/search-files.test.ts` | Find tool: glob patterns, gitignore |
| `tests/agent/list-directory.test.ts` | List tool: output format, sorting |
| `tests/agent/merger.test.ts` | Flatten agent results |

---

## Chunk 1: Foundation — Types and Path Utils

### Task 1: Agent Types

**Files:**
- Create: `src/agent/types.ts`
- Create: `tests/agent/types.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// tests/agent/types.test.ts
import { describe, it, expect } from 'vitest';
import {
  InlineFindingSchema,
  TopLevelFindingSchema,
  AgentFindingSchema,
} from '../../src/agent/types';

describe('InlineFindingSchema', () => {
  it('accepts valid inline finding', () => {
    const result = InlineFindingSchema.safeParse({
      kind: 'inline',
      file: 'docs/quickstart.md',
      startLine: 10,
      endLine: 12,
      message: 'Passive voice detected',
      ruleId: 'PassiveVoice',
    });
    expect(result.success).toBe(true);
  });

  it('rejects inline finding missing file', () => {
    const result = InlineFindingSchema.safeParse({
      kind: 'inline',
      startLine: 10,
      endLine: 12,
      message: 'test',
      ruleId: 'Test',
    });
    expect(result.success).toBe(false);
  });
});

describe('TopLevelFindingSchema', () => {
  it('accepts finding with references', () => {
    const result = TopLevelFindingSchema.safeParse({
      kind: 'top-level',
      message: 'Terminology drift detected',
      ruleId: 'Consistency',
      references: [
        { file: 'docs/a.md', startLine: 5 },
        { file: 'docs/b.md' },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('accepts structural finding with no references', () => {
    const result = TopLevelFindingSchema.safeParse({
      kind: 'top-level',
      message: 'llms.txt is missing',
      ruleId: 'LlmsTxt',
    });
    expect(result.success).toBe(true);
  });
});

describe('AgentFindingSchema', () => {
  it('discriminates by kind field', () => {
    const inline = AgentFindingSchema.safeParse({
      kind: 'inline', file: 'x.md', startLine: 1, endLine: 2,
      message: 'test', ruleId: 'R',
    });
    expect(inline.success).toBe(true);

    const topLevel = AgentFindingSchema.safeParse({
      kind: 'top-level', message: 'test', ruleId: 'R',
    });
    expect(topLevel.success).toBe(true);

    const invalid = AgentFindingSchema.safeParse({ kind: 'unknown' });
    expect(invalid.success).toBe(false);
  });
});

```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm run test:run -- tests/agent/types.test.ts
```
Expected: FAIL — `src/agent/types` module not found.

- [ ] **Step 3: Implement types**

```ts
// src/agent/types.ts
import { z } from 'zod';

export const InlineFindingSchema = z.object({
  kind: z.literal('inline'),
  file: z.string(),
  startLine: z.number(),
  endLine: z.number(),
  message: z.string(),
  suggestion: z.string().optional(),
  ruleId: z.string(),
});

export const TopLevelFindingSchema = z.object({
  kind: z.literal('top-level'),
  references: z.array(z.object({
    file: z.string(),
    startLine: z.number().optional(),
    endLine: z.number().optional(),
  })).optional(),
  message: z.string(),
  suggestion: z.string().optional(),
  ruleId: z.string(),
});

export const AgentFindingSchema = z.discriminatedUnion('kind', [
  InlineFindingSchema,
  TopLevelFindingSchema,
]);

export type AgentFinding = z.infer<typeof AgentFindingSchema>;
export type InlineFinding = z.infer<typeof InlineFindingSchema>;
export type TopLevelFinding = z.infer<typeof TopLevelFindingSchema>;

export interface AgentRunResult {
  findings: AgentFinding[];
  ruleId: string;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm run test:run -- tests/agent/types.test.ts
```
Expected: PASS (3 test suites, all green)

- [ ] **Step 5: Commit**

```bash
git add src/agent/types.ts tests/agent/types.test.ts
git commit -m "feat(agent): add AgentFinding and AgentRunResult types"
```

---

### Task 2: Path Utils

**Files:**
- Create: `src/agent/tools/path-utils.ts`
- Create: `tests/agent/path-utils.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// tests/agent/path-utils.test.ts
import { describe, it, expect } from 'vitest';
import * as path from 'path';
import { resolveToCwd, isWithinRoot } from '../../src/agent/tools/path-utils';

describe('resolveToCwd', () => {
  it('resolves relative paths against cwd', () => {
    const result = resolveToCwd('docs/quickstart.md', '/repo');
    expect(result).toBe('/repo/docs/quickstart.md');
  });

  it('returns absolute paths unchanged', () => {
    const result = resolveToCwd('/absolute/path.md', '/repo');
    expect(result).toBe('/absolute/path.md');
  });

  it('expands ~ to home directory', () => {
    const result = resolveToCwd('~/file.md', '/repo');
    expect(result).toContain('file.md');
    expect(result).not.toContain('~');
  });
});

describe('isWithinRoot', () => {
  it('returns true for path within root', () => {
    expect(isWithinRoot('/repo/docs/file.md', '/repo')).toBe(true);
  });

  it('returns false for path outside root', () => {
    expect(isWithinRoot('/etc/passwd', '/repo')).toBe(false);
  });

  it('blocks traversal attempts', () => {
    expect(isWithinRoot('/repo/../etc/passwd', '/repo')).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm run test:run -- tests/agent/path-utils.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement path utils**

```ts
// src/agent/tools/path-utils.ts
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
```

- [ ] **Step 4: Run tests**

```bash
npm run test:run -- tests/agent/path-utils.test.ts
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/agent/tools/path-utils.ts tests/agent/path-utils.test.ts
git commit -m "feat(agent): add path utils for tool cwd scoping"
```

---

## Chunk 2: Tool Suite

### Task 3: Read File Tool

**Files:**
- Create: `src/agent/tools/read-file.ts`
- Create: `tests/agent/read-file.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// tests/agent/read-file.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import * as path from 'path';
import { createReadFileTool } from '../../src/agent/tools/read-file';

const TMP = path.join(process.cwd(), 'tmp-read-file-test');

beforeEach(() => {
  mkdirSync(TMP, { recursive: true });
});

afterEach(() => {
  rmSync(TMP, { recursive: true, force: true });
});

describe('createReadFileTool', () => {
  it('reads a file and returns text content', async () => {
    writeFileSync(path.join(TMP, 'test.md'), 'Hello world\nLine two\n');
    const tool = createReadFileTool(TMP);
    const result = await tool.execute({ path: 'test.md' });
    expect(result).toContain('Hello world');
    expect(result).toContain('Line two');
  });

  it('supports offset and limit for pagination', async () => {
    const lines = Array.from({ length: 10 }, (_, i) => `Line ${i + 1}`).join('\n');
    writeFileSync(path.join(TMP, 'long.md'), lines);
    const tool = createReadFileTool(TMP);
    const result = await tool.execute({ path: 'long.md', offset: 3, limit: 2 });
    expect(result).toContain('Line 3');
    expect(result).toContain('Line 4');
    expect(result).not.toContain('Line 1');
    expect(result).not.toContain('Line 5');
  });

  it('throws for files outside cwd', async () => {
    const tool = createReadFileTool(TMP);
    await expect(tool.execute({ path: '../outside.md' })).rejects.toThrow();
  });

  it('returns actionable notice when file is truncated', async () => {
    // Create a large file (> 200 lines)
    const lines = Array.from({ length: 250 }, (_, i) => `Line ${i + 1}`).join('\n');
    writeFileSync(path.join(TMP, 'big.md'), lines);
    const tool = createReadFileTool(TMP);
    const result = await tool.execute({ path: 'big.md' });
    expect(result).toContain('Use offset=');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm run test:run -- tests/agent/read-file.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement read file tool**

```ts
// src/agent/tools/read-file.ts
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
```

- [ ] **Step 4: Run tests**

```bash
npm run test:run -- tests/agent/read-file.test.ts
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/agent/tools/read-file.ts tests/agent/read-file.test.ts
git commit -m "feat(agent): add read_file tool with pagination and traversal guard"
```

---

### Task 4: Search Files Tool

**Files:**
- Create: `src/agent/tools/search-files.ts`
- Create: `tests/agent/search-files.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// tests/agent/search-files.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import * as path from 'path';
import { createSearchFilesTool } from '../../src/agent/tools/search-files';

const TMP = path.join(process.cwd(), 'tmp-search-files-test');

beforeEach(() => {
  mkdirSync(path.join(TMP, 'docs'), { recursive: true });
  writeFileSync(path.join(TMP, 'docs', 'quickstart.md'), '# Quickstart');
  writeFileSync(path.join(TMP, 'docs', 'api.md'), '# API');
  writeFileSync(path.join(TMP, 'docs', 'config.ts'), 'export const x = 1');
  writeFileSync(path.join(TMP, 'README.md'), '# Readme');
});

afterEach(() => {
  rmSync(TMP, { recursive: true, force: true });
});

describe('createSearchFilesTool', () => {
  it('finds files matching glob pattern', async () => {
    const tool = createSearchFilesTool(TMP);
    const result = await tool.execute({ pattern: '**/*.md' });
    expect(result).toContain('quickstart.md');
    expect(result).toContain('api.md');
    expect(result).toContain('README.md');
  });

  it('excludes non-matching files', async () => {
    const tool = createSearchFilesTool(TMP);
    const result = await tool.execute({ pattern: '**/*.md' });
    expect(result).not.toContain('config.ts');
  });

  it('scopes search to provided path', async () => {
    const tool = createSearchFilesTool(TMP);
    const result = await tool.execute({ pattern: '*.md', path: 'docs' });
    expect(result).toContain('docs/quickstart.md');
    expect(result).not.toContain('README.md');
  });

  it('returns no files found message when no matches', async () => {
    const tool = createSearchFilesTool(TMP);
    const result = await tool.execute({ pattern: '**/*.xyz' });
    expect(result).toContain('No files found');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm run test:run -- tests/agent/search-files.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement search files tool**

```ts
// src/agent/tools/search-files.ts
import fg from 'fast-glob';
import * as path from 'node:path';
import { resolveToCwd, isWithinRoot } from './path-utils.js';

const DEFAULT_LIMIT = 1000;

export interface SearchFilesTool {
  name: 'search_files';
  description: string;
  execute(params: { pattern: string; path?: string; limit?: number }): Promise<string>;
}

export function createSearchFilesTool(cwd: string): SearchFilesTool {
  return {
    name: 'search_files',
    description: 'Find files by glob pattern. Returns paths relative to repo root. Examples: **/*.md, docs/*.md, src/**/*.ts',

    async execute({ pattern, path: searchDir, limit }) {
      const searchRoot = searchDir
        ? resolveToCwd(searchDir, cwd)
        : cwd;

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
      const searchPrefix = searchDir ? path.relative(cwd, searchRoot) : '';
      const output = limited
        .map((match) => (searchPrefix ? path.join(searchPrefix, match) : match))
        .join('\n');

      if (matches.length > effectiveLimit) {
        return `${output}\n\n[${effectiveLimit} results limit reached. Refine your pattern for more specific results.]`;
      }

      return output;
    },
  };
}
```

Implementation note: returning repo-root-relative paths keeps tool outputs composable, so `search_files` results can be passed directly to `read_file`/`lint` without reconstructing directory prefixes in the agent prompt loop.

- [ ] **Step 4: Run tests**

```bash
npm run test:run -- tests/agent/search-files.test.ts
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/agent/tools/search-files.ts tests/agent/search-files.test.ts
git commit -m "feat(agent): add search_files tool using fast-glob"
```

---

### Task 5: List Directory Tool

**Files:**
- Create: `src/agent/tools/list-directory.ts`
- Create: `tests/agent/list-directory.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// tests/agent/list-directory.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import * as path from 'path';
import { createListDirectoryTool } from '../../src/agent/tools/list-directory';

const TMP = path.join(process.cwd(), 'tmp-list-dir-test');

beforeEach(() => {
  mkdirSync(path.join(TMP, 'subdir'), { recursive: true });
  writeFileSync(path.join(TMP, 'file.md'), '');
  writeFileSync(path.join(TMP, '.hidden'), '');
});

afterEach(() => {
  rmSync(TMP, { recursive: true, force: true });
});

describe('createListDirectoryTool', () => {
  it('lists files and directories', async () => {
    const tool = createListDirectoryTool(TMP);
    const result = await tool.execute({});
    expect(result).toContain('file.md');
    expect(result).toContain('subdir/');
  });

  it('appends / to directories', async () => {
    const tool = createListDirectoryTool(TMP);
    const result = await tool.execute({});
    expect(result).toContain('subdir/');
    expect(result).not.toContain('file.md/');
  });

  it('includes dotfiles', async () => {
    const tool = createListDirectoryTool(TMP);
    const result = await tool.execute({});
    expect(result).toContain('.hidden');
  });

  it('lists a specific subdirectory', async () => {
    mkdirSync(path.join(TMP, 'subdir'), { recursive: true });
    writeFileSync(path.join(TMP, 'subdir', 'nested.md'), '');
    const tool = createListDirectoryTool(TMP);
    const result = await tool.execute({ path: 'subdir' });
    expect(result).toContain('nested.md');
    expect(result).not.toContain('file.md');
  });

  it('throws for paths outside root', async () => {
    const tool = createListDirectoryTool(TMP);
    await expect(tool.execute({ path: '../outside' })).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm run test:run -- tests/agent/list-directory.test.ts
```
Expected: FAIL.

- [ ] **Step 3: Implement list directory tool**

```ts
// src/agent/tools/list-directory.ts
import { readdirSync, statSync, existsSync } from 'node:fs';
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
          // skip unreadable entries
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
```

- [ ] **Step 4: Run tests**

```bash
npm run test:run -- tests/agent/list-directory.test.ts
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/agent/tools/list-directory.ts tests/agent/list-directory.test.ts
git commit -m "feat(agent): add list_directory tool"
```

---

### Task 6: Search Content Tool

**Files:**
- Create: `src/agent/tools/search-content.ts`

Note: This tool uses ripgrep (`rg`) if available, falling back to a pure JS implementation. `rg` is expected in the service environment. Tests use the JS fallback.

- [ ] **Step 1: Write failing tests**

```ts
// tests/agent/search-content.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import * as path from 'path';
import { createSearchContentTool } from '../../src/agent/tools/search-content';

const TMP = path.join(process.cwd(), 'tmp-search-content-test');

beforeEach(() => {
  mkdirSync(path.join(TMP, 'docs'), { recursive: true });
  writeFileSync(path.join(TMP, 'docs', 'a.md'), 'API key is required\nUse your API key here\n');
  writeFileSync(path.join(TMP, 'docs', 'b.md'), 'access token must be provided\n');
  writeFileSync(path.join(TMP, 'docs', 'c.md'), 'No relevant content\n');
});

afterEach(() => {
  rmSync(TMP, { recursive: true, force: true });
});

describe('createSearchContentTool', () => {
  it('finds pattern across files with file:line: format', async () => {
    const tool = createSearchContentTool(TMP);
    const result = await tool.execute({ pattern: 'API key' });
    expect(result).toMatch(/a\.md:\d+:/);
    expect(result).toContain('API key');
  });

  it('returns no matches message when nothing found', async () => {
    const tool = createSearchContentTool(TMP);
    const result = await tool.execute({ pattern: 'xyznotfound' });
    expect(result).toContain('No matches found');
  });

  it('supports case-insensitive search', async () => {
    const tool = createSearchContentTool(TMP);
    const result = await tool.execute({ pattern: 'api key', ignoreCase: true });
    expect(result).toContain('API key');
  });

  it('filters by glob pattern', async () => {
    writeFileSync(path.join(TMP, 'docs', 'skip.ts'), 'API key = process.env.KEY');
    const tool = createSearchContentTool(TMP);
    const result = await tool.execute({ pattern: 'API key', glob: '*.md' });
    expect(result).not.toContain('skip.ts');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm run test:run -- tests/agent/search-content.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement search content tool**

```ts
// src/agent/tools/search-content.ts
import { readFileSync, readdirSync, statSync } from 'node:fs';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import { resolveToCwd, isWithinRoot } from './path-utils.js';
import fg from 'fast-glob';

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
  args.push(pattern, searchRoot);

  const result = spawnSync('rg', args, { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 });

  if (result.status !== 0 && result.status !== 1) return 'No matches found';

  const lines: string[] = [];
  let matchCount = 0;
  const limit = opts.limit ?? DEFAULT_LIMIT;

  for (const line of (result.stdout || '').split('\n')) {
    if (!line.trim()) continue;
    try {
      const event = JSON.parse(line) as { type: string; data?: { path?: { text?: string }; line_number?: number; lines?: { text?: string } } };
      if (event.type === 'match' && event.data) {
        if (matchCount >= limit) break;
        const file = path.relative(searchRoot, event.data.path?.text ?? '');
        const lineNum = event.data.line_number ?? 0;
        const text = (event.data.lines?.text ?? '').replace(/\n$/, '');
        lines.push(`${file}:${lineNum}: ${text}`);
        matchCount++;
      }
    } catch {
      // skip non-JSON lines
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
      // skip unreadable files
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
    description: `Search file contents for a pattern. Returns file:line: matchedtext format. Default glob filter: *.md. Supports regex patterns.`,

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
```

- [ ] **Step 4: Run tests**

```bash
npm run test:run -- tests/agent/search-content.test.ts
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/agent/tools/search-content.ts tests/agent/search-content.test.ts
git commit -m "feat(agent): add search_content tool with ripgrep/js fallback"
```

---

### Task 7: Lint Tool + Tools Index

**Files:**
- Create: `src/agent/tools/lint-tool.ts`
- Create: `src/agent/tools/index.ts`

The lint tool wraps the existing `runPromptEvaluation` logic. It takes a file path and ruleId, runs the evaluator, and returns a lean summary.

- [ ] **Step 1: Implement lint tool** (no TDD — this wraps existing tested code)

```ts
// src/agent/tools/lint-tool.ts
import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import type { LLMProvider } from '../../providers/llm-provider.js';
import type { PromptFile } from '../../schemas/prompt-schemas.js';
import { createEvaluator } from '../../evaluators/index.js';
import { Type } from '../../evaluators/types.js';
import { isJudgeResult } from '../../prompts/schema.js';
import { resolveToCwd, isWithinRoot } from './path-utils.js';

export interface LintToolResult {
  score: number;
  violationCount: number;
  violations: Array<{ line: number; message: string }>;
}

export interface LintTool {
  name: 'lint';
  description: string;
  execute(params: { file: string; ruleId: string }): Promise<LintToolResult>;
}

export function createLintTool(
  cwd: string,
  rules: PromptFile[],
  provider: LLMProvider
): LintTool {
  return {
    name: 'lint',
    description: 'Run per-page VectorLint evaluation on a single file against a specific rule. Returns score and violations. Use ruleId from the rule\'s frontmatter id field.',

    async execute({ file, ruleId }) {
      const absolutePath = resolveToCwd(file, cwd);

      if (!isWithinRoot(absolutePath, cwd)) {
        throw new Error(`Path traversal blocked: ${file} is outside the allowed root`);
      }

      const rule = rules.find((r) => r.meta.id === ruleId);
      if (!rule) {
        throw new Error(`Rule not found: ${ruleId}. Available rules: ${rules.map((r) => r.meta.id).join(', ')}`);
      }

      const content = readFileSync(absolutePath, 'utf-8');
      const relFile = path.relative(cwd, absolutePath);

      const evaluator = createEvaluator(Type.BASE, provider, rule);
      const result = await evaluator.evaluate(relFile, content);

      if (isJudgeResult(result)) {
        const violations = result.criteria.flatMap((c) =>
          c.violations.map((v) => ({ line: v.line, message: v.message }))
        );
        return {
          score: result.final_score,
          violationCount: violations.length,
          violations,
        };
      }

      // RawCheckResult
      const violations = result.violations
        .filter((v) => v.line != null)
        .map((v) => ({ line: v.line as number, message: v.message ?? v.description ?? '' }));
      return {
        score: 0,
        violationCount: violations.length,
        violations,
      };
    },
  };
}
```

- [ ] **Step 2: Create tools index**

```ts
// src/agent/tools/index.ts
export { createReadFileTool } from './read-file.js';
export { createSearchContentTool } from './search-content.js';
export { createSearchFilesTool } from './search-files.js';
export { createListDirectoryTool } from './list-directory.js';
export { createLintTool } from './lint-tool.js';
export type { LintToolResult, LintTool } from './lint-tool.js';
export { resolveToCwd, isWithinRoot, expandPath } from './path-utils.js';
```

- [ ] **Step 3: Run full test suite to check nothing broke**

```bash
npm run test:run
```
Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/agent/tools/lint-tool.ts src/agent/tools/index.ts
git commit -m "feat(agent): add lint sub-tool and tools index"
```

---

## Chunk 3: Agent Executor

### Task 9: Agent Executor

**Files:**
- Create: `src/agent/agent-executor.ts`
- Create: `tests/agent/agent-executor.test.ts`

The agent executor uses `generateText` from the Vercel AI SDK with tool definitions. It accepts a `LanguageModel` directly (from `@ai-sdk/*` providers), since tool-use loops require the model object, not the `LLMProvider` abstraction. The SDK manages the tool-use loop natively — no manual while-loop required.

**Stop conditions (all active simultaneously):**
- **Natural stop** — LLM returns a response with no tool calls (primary exit)
- **`maxSteps: 25`** — hard cap; safety net for runaway loops. Each step = one LLM call + all tool calls it requests
- **`AbortSignal`** — wall-clock timeout from the orchestrator; propagates to all tools and the LLM call
- **Structured output** — `AgentFindingSchema` forces a final valid response shape, acting as a natural forcing function

- [ ] **Step 1: Write failing tests**

```ts
// tests/agent/agent-executor.test.ts
import { describe, it, expect, vi } from 'vitest';

// Mock Vercel AI SDK
const MOCK_GENERATE_TEXT = vi.hoisted(() => vi.fn());
vi.mock('ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ai')>();
  return { ...actual, generateText: MOCK_GENERATE_TEXT };
});

import { runAgentExecutor } from '../../src/agent/agent-executor';
import type { LanguageModel } from 'ai';

const MOCK_MODEL = {} as unknown as LanguageModel;
const MOCK_CWD = '/fake/repo';

function makeRule(id: string, body: string) {
  return {
    id, filename: `${id}.md`, fullPath: `/rules/${id}.md`, pack: 'Test',
    body, meta: { id, name: id },
  };
}

describe('runAgentExecutor', () => {
  it('returns findings from agent tool call output', async () => {
    MOCK_GENERATE_TEXT.mockResolvedValueOnce({
      text: '',
      toolCalls: [],
      toolResults: [],
      finishReason: 'stop',
      experimental_output: {
        findings: [
          {
            kind: 'inline',
            file: 'docs/quickstart.md',
            startLine: 5,
            endLine: 5,
            message: 'Passive voice found',
            ruleId: 'PassiveVoice',
          },
        ],
      },
    });

    const rule = makeRule('PassiveVoice', 'Check for passive voice');
    const result = await runAgentExecutor({
      rule: rule as any,
      cwd: MOCK_CWD,
      model: MOCK_MODEL,
      tools: {} as any,
      diffContext: 'Changed: docs/quickstart.md',
    });

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.kind).toBe('inline');
    expect(result.ruleId).toBe('PassiveVoice');
  });

  it('returns empty findings when agent finds nothing', async () => {
    MOCK_GENERATE_TEXT.mockResolvedValueOnce({
      text: 'No issues found.',
      toolCalls: [],
      toolResults: [],
      finishReason: 'stop',
      experimental_output: { findings: [] },
    });

    const rule = makeRule('Consistency', 'Check terminology');
    const result = await runAgentExecutor({
      rule: rule as any,
      cwd: MOCK_CWD,
      model: MOCK_MODEL,
      tools: {} as any,
      diffContext: '',
    });

    expect(result.findings).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm run test:run -- tests/agent/agent-executor.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement agent executor**

```ts
// src/agent/agent-executor.ts
import { generateText } from 'ai';
import type { LanguageModel } from 'ai';
import { z } from 'zod';
import type { PromptFile } from '../schemas/prompt-schemas.js';
import {
  AgentFindingSchema,
  type AgentFinding,
  type AgentRunResult,
} from './types.js';
import type { ReadFileTool } from './tools/read-file.js';
import type { SearchContentTool } from './tools/search-content.js';
import type { SearchFilesTool } from './tools/search-files.js';
import type { ListDirectoryTool } from './tools/list-directory.js';
import type { LintTool } from './tools/lint-tool.js';

export interface AgentTools {
  read_file: ReadFileTool;
  search_content: SearchContentTool;
  search_files: SearchFilesTool;
  list_directory: ListDirectoryTool;
  lint: LintTool;
}

export interface AgentExecutorParams {
  rule: PromptFile;
  cwd: string;
  model: LanguageModel;
  tools: AgentTools;
  diffContext: string;
  signal?: AbortSignal;       // wall-clock timeout from orchestrator
  userInstructions?: string;  // VECTORLINT.md content, if present
}

const AgentOutputSchema = z.object({
  findings: z.array(AgentFindingSchema),
});

function buildSystemPrompt(
  rule: PromptFile,
  diffContext: string,
  cwd: string,
  userInstructions?: string,
): string {
  const date = new Date().toISOString().slice(0, 10);

  const toolDescriptions = `Available tools:
- read_file: Read text file contents with offset/limit pagination
- search_content: Search file contents by regex pattern across multiple files (returns file:line: matchedtext)
- search_files: Find files by glob pattern (e.g. **/*.md, src/**/*.ts)
- list_directory: List directory contents — / suffix on directories, includes dotfiles
- lint: Run per-page VectorLint evaluation on a single file and rule — returns score and violations`;

  const guidelines = `Guidelines:
- Start from the changed files in the PR context, then search outward only if the rule requires it
- Use search_content to find patterns across files — do not read every file sequentially
- Use lint for per-page quality checks — it returns a lean summary without bloating your context
- When you have sufficient evidence to evaluate the rule, return your findings immediately
- Only report genuine problems — do not speculate
- Reference exact file paths and line numbers in every inline finding`;

  const outputInstructions = `When you have completed your evaluation, return a JSON object with a "findings" array. Each finding must be either:
- { kind: "inline", file, startLine, endLine, message, ruleId, suggestion? } — for specific line-level issues
- { kind: "top-level", message, ruleId, suggestion?, references?: [{ file, startLine?, endLine? }] } — for cross-doc or structural issues

Return empty findings array if no issues found. Only report genuine problems.`;

  const sections = [
    `You are a senior technical writer evaluating documentation quality. You have a tool belt: use the lint tool for per-page evaluation and the file tools to gather cross-file evidence.`,
    `Rule: ${rule.meta.name} (${rule.meta.id})\n${rule.body}`,
    toolDescriptions,
    guidelines,
  ];

  if (userInstructions) {
    sections.push(`User Instructions (from VECTORLINT.md):\n${userInstructions}`);
  }

  if (diffContext) {
    sections.push(`Context — what changed in this PR:\n${diffContext}`);
  }

  sections.push(outputInstructions);
  sections.push(`Current date: ${date}\nRepo root: ${cwd}`);

  return sections.join('\n\n');
}

export async function runAgentExecutor(params: AgentExecutorParams): Promise<AgentRunResult> {
  const { rule, cwd, model, tools, diffContext, signal, userInstructions } = params;

  const systemPrompt = buildSystemPrompt(rule, diffContext, cwd, userInstructions);

  const sdkTools = {
    read_file: {
      description: tools.read_file.description,
      parameters: z.object({
        path: z.string().describe('File path relative to repo root'),
        offset: z.number().optional().describe('Line number to start reading from (1-indexed)'),
        limit: z.number().optional().describe('Maximum number of lines to read'),
      }),
      execute: async (args: { path: string; offset?: number; limit?: number }) =>
        tools.read_file.execute(args),
    },
    search_content: {
      description: tools.search_content.description,
      parameters: z.object({
        pattern: z.string().describe('Search pattern (regex or literal)'),
        path: z.string().optional().describe('Directory to search (default: repo root)'),
        glob: z.string().optional().describe('File glob filter (default: **/*.md)'),
        ignoreCase: z.boolean().optional().describe('Case-insensitive search'),
        limit: z.number().optional().describe('Max matches to return'),
      }),
      execute: async (args: { pattern: string; path?: string; glob?: string; ignoreCase?: boolean; limit?: number }) =>
        tools.search_content.execute(args),
    },
    search_files: {
      description: tools.search_files.description,
      parameters: z.object({
        pattern: z.string().describe('Glob pattern, e.g. **/*.md'),
        path: z.string().optional().describe('Directory to search'),
        limit: z.number().optional(),
      }),
      execute: async (args: { pattern: string; path?: string; limit?: number }) =>
        tools.search_files.execute(args),
    },
    list_directory: {
      description: tools.list_directory.description,
      parameters: z.object({
        path: z.string().optional().describe('Directory path (default: repo root)'),
        limit: z.number().optional(),
      }),
      execute: async (args: { path?: string; limit?: number }) =>
        tools.list_directory.execute(args),
    },
    lint: {
      description: tools.lint.description,
      parameters: z.object({
        file: z.string().describe('File path to lint'),
        ruleId: z.string().describe('Rule ID from the rule frontmatter id field'),
      }),
      execute: async (args: { file: string; ruleId: string }) =>
        tools.lint.execute(args),
    },
  };

  try {
    const response = await generateText({
      model,
      system: systemPrompt,
      prompt: `Evaluate the documentation according to the rule "${rule.meta.name}". Return your findings as JSON.`,
      tools: sdkTools,
      maxSteps: 25,
      abortSignal: signal,
      experimental_output: {
        schema: AgentOutputSchema,
      },
    });

    const output = (response as { experimental_output?: unknown }).experimental_output;
    const parsed = AgentOutputSchema.safeParse(output);

    if (!parsed.success) {
      return { findings: [], ruleId: rule.meta.id };
    }

    return { findings: parsed.data.findings, ruleId: rule.meta.id };
  } catch {
    return { findings: [], ruleId: rule.meta.id };
  }
}
```

- [ ] **Step 4: Run tests**

```bash
npm run test:run -- tests/agent/agent-executor.test.ts
```
Expected: PASS

- [ ] **Step 5: Run full suite**

```bash
npm run test:run
```
Expected: All pass.

- [ ] **Step 6: Commit**

```bash
git add src/agent/agent-executor.ts tests/agent/agent-executor.test.ts
git commit -m "feat(agent): add agent executor with Vercel AI SDK tool-use loop"
```

---

## Chunk 4: Merger + Output Formatting

### Task 10: Report Merger

**Files:**
- Create: `src/agent/merger.ts`
- Create: `tests/agent/merger.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// tests/agent/merger.test.ts
import { describe, it, expect } from 'vitest';
import { collectAgentFindings } from '../../src/agent/merger';
import type { AgentRunResult } from '../../src/agent/types';

describe('collectAgentFindings', () => {
  it('flattens findings from a single agent result', () => {
    const agentResult: AgentRunResult = {
      ruleId: 'LlmsTxt',
      findings: [
        { kind: 'top-level', message: 'llms.txt is missing', ruleId: 'LlmsTxt' },
      ],
    };

    const findings = collectAgentFindings([agentResult]);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toBe('llms.txt is missing');
  });

  it('flattens findings from multiple agent results', () => {
    const results: AgentRunResult[] = [
      {
        ruleId: 'Coverage',
        findings: [
          { kind: 'top-level', message: 'Missing page for feature X', ruleId: 'Coverage' },
          { kind: 'inline', file: 'docs/a.md', startLine: 5, endLine: 5, message: 'Stale param', ruleId: 'Coverage' },
        ],
      },
      {
        ruleId: 'BrokenLinks',
        findings: [
          { kind: 'inline', file: 'docs/b.md', startLine: 12, endLine: 12, message: 'Broken link', ruleId: 'BrokenLinks' },
        ],
      },
    ];

    const findings = collectAgentFindings(results);
    expect(findings).toHaveLength(3);
  });

  it('returns empty array when no findings', () => {
    const results: AgentRunResult[] = [
      { ruleId: 'Coverage', findings: [] },
      { ruleId: 'BrokenLinks', findings: [] },
    ];
    expect(collectAgentFindings(results)).toHaveLength(0);
  });

  it('returns empty array for empty input', () => {
    expect(collectAgentFindings([])).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm run test:run -- tests/agent/merger.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement merger**

```ts
// src/agent/merger.ts
import type { AgentFinding, AgentRunResult } from './types.js';

export function collectAgentFindings(agentResults: AgentRunResult[]): AgentFinding[] {
  return agentResults.flatMap((r) => r.findings);
}
```

- [ ] **Step 4: Run tests**

```bash
npm run test:run -- tests/agent/merger.test.ts
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/agent/merger.ts tests/agent/merger.test.ts
git commit -m "feat(agent): add merger that flattens agent findings"
```

---

### Task 11: Output Format — Agent Findings Rendering

**Files:**
- Modify: `src/output/reporter.ts`
- Modify: `src/output/json-formatter.ts`

The `line` formatter needs to render agent findings. The `json` formatter needs a `source` field. In agent mode, `rdjson` should map agent findings into diagnostics; `vale-json` remains unsupported and falls back to JSON with a warning.

- [ ] **Step 1: Read the reporter to understand current structure**

Read `src/output/reporter.ts` (focus on the `printIssueRow` function and surrounding code) to understand what parameters the existing render path expects before making changes.

- [ ] **Step 2: Add agent finding renderer to reporter**

In `src/output/reporter.ts`, add a new exported function `printAgentFinding`:

```ts
// Add to src/output/reporter.ts
import type { AgentFinding } from '../agent/types.js';

export function printAgentFinding(finding: AgentFinding): void {
  if (finding.kind === 'inline') {
    const location = `${finding.file}:${finding.startLine}`;
    console.log(`  [agent] ${location}`);
    console.log(`    ${finding.message}`);
    if (finding.suggestion) console.log(`    Suggestion: ${finding.suggestion}`);
  } else {
    // top-level
    console.log(`  [agent] ${finding.message}`);
    if (finding.suggestion) console.log(`    Suggestion: ${finding.suggestion}`);
    if (finding.references && finding.references.length > 0) {
      for (const ref of finding.references) {
        const loc = ref.startLine ? `${ref.file}:${ref.startLine}` : ref.file;
        console.log(`    → ${loc}`);
      }
    }
  }
}
```

- [ ] **Step 3: Add source field to JSON formatter**

In `src/output/json-formatter.ts`, locate the `Issue` type and add `source` as an optional field:

```ts
// Add to the Issue interface in json-formatter.ts
source?: 'lint' | 'agent';
```

- [ ] **Step 4: Run full test suite**

```bash
npm run test:run
```
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/output/reporter.ts src/output/json-formatter.ts
git commit -m "feat(agent): add agent finding rendering to line and JSON output"
```

---

## Chunk 5: CLI Integration

### Task 12: Wire Agent Mode into CLI

**Files:**
- Modify: `src/cli/commands.ts`
- Modify: `src/cli/orchestrator.ts`
- Create: `src/agent/index.ts`

- [ ] **Step 1: Create agent module index**

```ts
// src/agent/index.ts
export { runAgentExecutor } from './agent-executor.js';
export { collectAgentFindings } from './merger.js';
export {
  createReadFileTool,
  createSearchContentTool,
  createSearchFilesTool,
  createListDirectoryTool,
  createLintTool,
} from './tools/index.js';
export type { AgentFinding, AgentRunResult } from './types.js';
```

- [ ] **Step 2: Read commands.ts to understand how flags are added**

Read `src/cli/commands.ts` to understand the commander pattern used for existing flags (e.g., `--output`) before adding `--mode`.

- [ ] **Step 3: Add `--mode` flag to CLI commands**

In `src/cli/commands.ts`, find where `--output` option is registered and add `--mode` alongside it:

```ts
.option('--mode <mode>', 'Evaluation mode: "agent" enables cross-document evaluation', undefined)
```

Pass `mode` through `EvaluationOptions` or as a top-level flag to the orchestrator.

- [ ] **Step 4: Read orchestrator to find where to inject agent mode**

Read `src/cli/orchestrator.ts` around the `evaluateFile` function and the main evaluation loop (search for where `prompts` and `provider` are used together) to identify the right injection point.

- [ ] **Step 5: Add `mode` to `EvaluationOptions`**

In `src/cli/types.ts`, add `mode` to `EvaluationOptions`:

```ts
// Add to EvaluationOptions interface
mode?: 'agent' | 'lint';
```

- [ ] **Step 6: Wire agent mode in orchestrator**

In `src/cli/orchestrator.ts`, find the main evaluation entry point and add the agent mode branch:

```ts
// In the main evaluation function, before the existing per-file loop:
if (options.mode === 'agent') {
  return runAgentMode(options, files);
}
// ... existing lint-only path continues
```

Add `runAgentMode` function that:
1. Loads VECTORLINT.md user instructions if present
2. Extracts `LanguageModel` from provider (cast to `VercelAIProvider` if needed)
3. Creates tools using factory functions scoped to `cwd`
4. Runs `runAgentExecutor` for every rule in parallel
5. Calls `collectAgentFindings` and formats output

```ts
async function runAgentMode(
  options: EvaluationOptions,
  files: string[]
): Promise<EvaluationResult> {
  const { prompts, provider } = options;
  const cwd = process.cwd();

  // Load VECTORLINT.md user instructions if present (same file the lint executor uses)
  let userInstructions: string | undefined;
  const vectorlintMdPath = path.join(cwd, 'VECTORLINT.md');
  try {
    userInstructions = readFileSync(vectorlintMdPath, 'utf-8');
  } catch {
    // File absent — omit from agent prompt
  }

  // Create tools scoped to cwd
  const tools = {
    read_file: createReadFileTool(cwd),
    search_content: createSearchContentTool(cwd),
    search_files: createSearchFilesTool(cwd),
    list_directory: createListDirectoryTool(cwd),
    lint: createLintTool(cwd, prompts, provider),
  };

  // Extract LanguageModel from VercelAIProvider
  const vercelProvider = provider as import('../providers/vercel-ai-provider.js').VercelAIProvider;
  const model = (vercelProvider as unknown as { config: { model: import('ai').LanguageModel } }).config.model;

  // Run all rules through agent executor in parallel — no planner, no pre-classification
  const agentResults = await Promise.all(
    prompts.map((rule) =>
      runAgentExecutor({ rule, cwd, model, tools, diffContext: '', userInstructions })
    )
  );

  const findings = collectAgentFindings(agentResults);

  // Print agent findings
  for (const finding of findings) {
    printAgentFinding(finding);
  }

  // Return summary
  return {
    totalFiles: files.length,
    totalErrors: findings.length,
    totalWarnings: 0,
    requestFailures: 0,
    hadOperationalErrors: false,
    hadSeverityErrors: findings.length > 0,
  };
}
```

- [ ] **Step 7: Run full test suite**

```bash
npm run test:run
```
Expected: All tests pass.

- [ ] **Step 8: Smoke test agent mode manually**

```bash
npm run dev -- --mode agent ./presets/VectorLint/ai-pattern.md
```
Expected: CLI runs without crashing. Output varies by env/provider setup.

- [ ] **Step 9: Commit**

```bash
git add src/agent/index.ts src/cli/commands.ts src/cli/types.ts src/cli/orchestrator.ts
git commit -m "feat(agent): wire --mode agent into CLI, run all rules through agent executor"
```

---

## Final Check

- [ ] **Run full test suite one last time**

```bash
npm run test:run
```
Expected: All tests pass, no regressions.

- [ ] **Run linter**

```bash
npm run lint
```
Expected: No errors.

- [ ] **Final commit if any lint fixes were needed**

```bash
git add -A
git commit -m "chore: fix lint issues from agent mode implementation"
```
