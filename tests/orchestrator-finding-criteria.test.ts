import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { evaluateFiles } from "../src/cli/orchestrator";
import { OutputFormat, type EvaluationOptions } from "../src/cli/types";
import { EvaluationType, Severity } from "../src/evaluators/types";
import type { PromptFile } from "../src/prompts/prompt-loader";
import type { RawCheckResult } from "../src/prompts/schema";
import type { ReviewResult } from "../src/review/types";

const { EVALUATE_MOCK, PROCESS_FINDINGS_MOCK } = vi.hoisted(() => ({
  EVALUATE_MOCK: vi.fn(),
  PROCESS_FINDINGS_MOCK: vi.fn<(input: unknown) => ReviewResult>(),
}));

// createEvaluator returns a controllable evaluator so evaluateFiles reaches
// routePromptResult -> processFindings without a real model call.
vi.mock("../src/evaluators/index", () => ({
  createEvaluator: vi.fn(() => ({
    evaluate: EVALUATE_MOCK,
  })),
}));

// Replace only processFindings (the findings boundary); keep every other
// findings export real so unrelated imports stay intact.
vi.mock("../src/findings", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/findings")>();
  return { ...actual, processFindings: PROCESS_FINDINGS_MOCK };
});

function createPrompt(meta: PromptFile["meta"]): PromptFile {
  return {
    id: meta.id,
    filename: `${meta.id}.md`,
    fullPath: path.join(process.cwd(), "prompts", `${meta.id}.md`),
    meta,
    body: "Prompt body",
    pack: "TestPack",
  };
}

function createBaseOptions(prompts: PromptFile[]): EvaluationOptions {
  return {
    prompts,
    rulesPath: undefined,
    provider: {} as never,
    concurrency: 1,
    verbose: false,
    debugJson: false,
    scanPaths: [],
    outputFormat: OutputFormat.Line,
  };
}

function createTempFile(content: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), "vectorlint-criteria-"));
  const filePath = path.join(dir, "input.md");
  writeFileSync(filePath, content);
  return filePath;
}

function makeCheckResult(): RawCheckResult {
  return {
    type: EvaluationType.CHECK,
    violations: [],
    word_count: 100,
  };
}

describe("standard check orchestration sanitizes criteria at the findings boundary", () => {
  beforeEach(() => {
    EVALUATE_MOCK.mockReset();
    PROCESS_FINDINGS_MOCK.mockReset();
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("drops rubric weight/target from criteria before reaching processFindings", async () => {
    const targetFile = createTempFile("Alpha text\n");
    // PromptCriterionSpec admits legacy rubric fields (weight, target). The
    // orchestrator must strip them so only { id, name } crosses the boundary.
    const prompt = createPrompt({
      id: "SanitizePrompt",
      name: "Sanitize Prompt",
      type: "check",
      severity: Severity.WARNING,
      criteria: [
        { id: "Hedging", name: "Hedge words", weight: 3, target: { regex: "x" } },
      ],
    });

    EVALUATE_MOCK.mockResolvedValue(makeCheckResult());
    PROCESS_FINDINGS_MOCK.mockReturnValue({
      findings: [],
      scores: [
        {
          ruleId: "TestPack.SanitizePrompt",
          score: 10,
          scoreText: "10.0/10",
          severity: "warning",
        },
      ],
      diagnostics: [],
    });

    await evaluateFiles([targetFile], createBaseOptions([prompt]));

    expect(PROCESS_FINDINGS_MOCK).toHaveBeenCalledTimes(1);
    const input = PROCESS_FINDINGS_MOCK.mock.calls[0]![0] as {
      promptMeta: { criteria?: Array<Record<string, unknown>> };
    };

    // toEqual fails if any extra (weight/target) key survives the mapping.
    expect(input.promptMeta.criteria).toEqual([{ id: "Hedging", name: "Hedge words" }]);
    for (const criterion of input.promptMeta.criteria ?? []) {
      expect(criterion).not.toHaveProperty("weight");
      expect(criterion).not.toHaveProperty("target");
    }
  });
});
