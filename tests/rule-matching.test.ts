import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runAgentExecutor } from '../src/agent/executor';
import { OutputFormat, type EvaluationOptions } from '../src/cli/types';
import { EvaluationType, Severity } from '../src/evaluators/types';
import type { PromptFile } from '../src/prompts/prompt-loader';
import type { LLMProvider } from '../src/providers/llm-provider';
import { resolveMatchedPromptsForFile } from '../src/rules/matched-prompts';
import type { FilePatternConfig } from '../src/boundaries/file-section-parser';

function makePrompt(params: {
  fullPath: string;
  id: string;
  name: string;
  pack?: string;
}): PromptFile {
  return {
    id: params.id.toLowerCase(),
    filename: path.basename(params.fullPath),
    fullPath: params.fullPath,
    pack: params.pack ?? 'Default',
    body: `${params.name} body`,
    meta: {
      id: params.id,
      name: params.name,
      type: 'check',
      severity: Severity.WARNING,
    },
  };
}

function makeStandardOptions(prompts: PromptFile[], scanPaths: EvaluationOptions['scanPaths']): EvaluationOptions {
  return {
    prompts,
    rulesPath: undefined,
    provider: {} as never,
    concurrency: 1,
    verbose: false,
    debugJson: false,
    scanPaths,
    outputFormat: OutputFormat.Json,
  };
}

function normalizeRuleMatches(
  matches: Array<{ file: string; ruleSource: string }>
): string[] {
  return matches.map((match) => `${match.file}:${match.ruleSource}`);
}

function makeAgentProvider(): LLMProvider {
  return {
    runPromptStructured() {
      throw new Error('not used');
    },
    async runAgentToolLoop(params: Record<string, unknown>) {
      const tools = params.tools as Record<string, { execute: (input: unknown) => Promise<unknown> }>;
      await tools.finalize_review.execute({});
      return {
        usage: { inputTokens: 1, outputTokens: 1 },
      };
    },
  } as unknown as LLMProvider;
}

describe('rule matching', () => {
  const tempDirs: string[] = [];

  function createTempRepo(): string {
    const repo = mkdtempSync(path.join(process.cwd(), 'tmp-rule-matching-'));
    tempDirs.push(repo);
    return repo;
  }

  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    for (const dir of tempDirs.splice(0, tempDirs.length)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('returns all prompts when scanPaths is empty', () => {
    const prompts = [
      makePrompt({
        fullPath: 'packs/default/consistency.md',
        id: 'Consistency',
        name: 'Consistency',
      }),
      makePrompt({
        fullPath: 'VECTORLINT.md',
        id: 'StyleGuide',
        name: 'Style Guide',
        pack: '',
      }),
    ];

    const resolution = resolveMatchedPromptsForFile({
      filePath: 'docs/guide.md',
      prompts,
      scanPaths: [],
    });

    expect(resolution.prompts).toEqual(prompts);
    expect(resolution.packs).toEqual(['Default']);
    expect(resolution.overrides).toEqual({});
  });

  it('filters by active packs and disabled overrides while keeping packless prompts', () => {
    const prompts = [
      makePrompt({
        fullPath: 'packs/default/consistency.md',
        id: 'Consistency',
        name: 'Consistency',
      }),
      makePrompt({
        fullPath: 'packs/default/links.md',
        id: 'Links',
        name: 'Links',
      }),
      makePrompt({
        fullPath: 'packs/seo/headings.md',
        id: 'Headings',
        name: 'Headings',
        pack: 'SEO',
      }),
      makePrompt({
        fullPath: 'VECTORLINT.md',
        id: 'StyleGuide',
        name: 'Style Guide',
        pack: '',
      }),
    ];

    const resolution = resolveMatchedPromptsForFile({
      filePath: 'docs/guide.md',
      prompts,
      scanPaths: [
        {
          pattern: '**/*.md',
          runRules: ['Default'],
          overrides: {
            'Default.Links': 'disabled',
          },
        },
      ],
    });

    expect(resolution.prompts.map((prompt) => prompt.fullPath)).toEqual([
      'packs/default/consistency.md',
      'VECTORLINT.md',
    ]);
    expect(resolution.packs).toEqual(['Default']);
    expect(resolution.overrides).toEqual({
      'Default.Links': 'disabled',
    });
  });

  it('keeps standard and agent flows in sync for matched prompts', async () => {
    const { evaluateFiles } = await import('../src/cli/orchestrator');
    const evaluators = await import('../src/evaluators/index');

    const repo = createTempRepo();
    const file = path.join(repo, 'docs', 'release', 'guide.md');
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, 'content\n', 'utf8');
    const standardMatchedPromptSources: string[] = [];

    const prompts = [
      makePrompt({
        fullPath: 'packs/default/consistency.md',
        id: 'Consistency',
        name: 'Consistency',
      }),
      makePrompt({
        fullPath: 'packs/default/links.md',
        id: 'Links',
        name: 'Links',
      }),
      makePrompt({
        fullPath: 'packs/seo/headings.md',
        id: 'Headings',
        name: 'Headings',
        pack: 'SEO',
      }),
      makePrompt({
        fullPath: 'VECTORLINT.md',
        id: 'StyleGuide',
        name: 'Style Guide',
        pack: '',
      }),
    ];
    const anchoredPrefix = path.basename(repo);
    const scanPaths: FilePatternConfig[] = [
      {
        pattern: `${anchoredPrefix}/docs/**/*.md`,
        runRules: ['Default', 'SEO'],
        overrides: {
          'Default.Links': 'disabled',
        },
      },
      {
        pattern: `${anchoredPrefix}/docs/release/*.md`,
        overrides: {
          'SEO.Headings': 'disabled',
        },
      },
    ];

    vi.spyOn(evaluators, 'createEvaluator').mockImplementation(
      (_type: string, _provider: unknown, prompt: PromptFile) =>
        ({
          evaluate: vi.fn(() => {
            standardMatchedPromptSources.push(prompt.fullPath);
            return Promise.resolve({
              type: EvaluationType.CHECK,
              violations: [],
              word_count: 10,
            });
          }),
        }) as never
    );

    await evaluateFiles([file], makeStandardOptions(prompts, scanPaths));

    const agentResult = await runAgentExecutor({
      targets: [file],
      prompts,
      provider: makeAgentProvider(),
      workspaceRoot: process.cwd(),
      scanPaths,
      outputFormat: OutputFormat.Json,
      printMode: false,
      sessionHomeDir: repo,
    });

    expect(standardMatchedPromptSources).toEqual([
      'packs/default/consistency.md',
      'VECTORLINT.md',
    ]);
    expect(normalizeRuleMatches(agentResult.fileRuleMatches)).toEqual([
      `${anchoredPrefix}/docs/release/guide.md:packs/default/consistency.md`,
      `${anchoredPrefix}/docs/release/guide.md:VECTORLINT.md`,
    ]);
  });

  it('throws when scanPaths is non-empty and no pattern matches the file', () => {
    const prompts = [
      makePrompt({
        fullPath: 'packs/default/consistency.md',
        id: 'Consistency',
        name: 'Consistency',
      }),
    ];

    expect(() =>
      resolveMatchedPromptsForFile({
        filePath: 'docs/guide.md',
        prompts,
        scanPaths: [
          {
            pattern: 'blog/**/*.md',
            runRules: ['Default'],
            overrides: {},
          },
        ],
      })
    ).toThrow('No configuration found for this path: docs/guide.md');
  });
});
