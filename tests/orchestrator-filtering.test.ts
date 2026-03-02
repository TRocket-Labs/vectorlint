import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { evaluateFiles } from "../src/cli/orchestrator";
import { OutputFormat, type EvaluationOptions } from "../src/cli/types";
import { EvaluationType, Severity } from "../src/evaluators/types";
import type { PromptFile } from "../src/prompts/prompt-loader";

const { EVALUATE_MOCK } = vi.hoisted(() => ({
  EVALUATE_MOCK: vi.fn(),
}));

vi.mock("../src/evaluators/index", () => ({
  createEvaluator: vi.fn(() => ({
    evaluate: EVALUATE_MOCK,
  })),
}));

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
  const dir = mkdtempSync(path.join(tmpdir(), "vectorlint-filtering-"));
  const filePath = path.join(dir, "input.md");
  writeFileSync(filePath, content);
  return filePath;
}

const FULLY_SUPPORTED_CHECKS = {
  rule_supports_claim: true,
  evidence_exact: true,
  context_supports_violation: true,
  plausible_non_violation: false,
  fix_is_drop_in: true,
  fix_preserves_meaning: true,
} as const;

describe("CLI violation filtering", () => {
  const originalThreshold = process.env.VECTORLINT_CONFIDENCE_THRESHOLD;

  beforeEach(() => {
    EVALUATE_MOCK.mockReset();
    delete process.env.VECTORLINT_CONFIDENCE_THRESHOLD;
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    if (originalThreshold === undefined) {
      delete process.env.VECTORLINT_CONFIDENCE_THRESHOLD;
    } else {
      process.env.VECTORLINT_CONFIDENCE_THRESHOLD = originalThreshold;
    }
    vi.restoreAllMocks();
  });

  it("filters low-confidence check violations from CLI counts by default", async () => {
    const targetFile = createTempFile("Alpha text\nBeta text\n");
    const prompt = createPrompt({
      id: "CheckPrompt",
      name: "Check Prompt",
      type: "check",
      severity: Severity.WARNING,
    });

    EVALUATE_MOCK.mockResolvedValue({
      type: EvaluationType.CHECK,
      final_score: 8,
      percentage: 80,
      violation_count: 2,
      items: [],
      severity: Severity.WARNING,
      message: "Found issues",
      violations: [
        {
          line: 1,
          analysis: "Issue 1",
          suggestion: "Suggestion 1",
          fix: "Fix 1",
          quoted_text: "Alpha text",
          context_before: "",
          context_after: "",
          rule_quote: "Rule quote",
          checks: FULLY_SUPPORTED_CHECKS,
          confidence: 0.9,
        },
        {
          line: 2,
          analysis: "Issue 2",
          suggestion: "Suggestion 2",
          fix: "Fix 2",
          quoted_text: "Beta text",
          context_before: "",
          context_after: "",
          rule_quote: "Rule quote",
          checks: FULLY_SUPPORTED_CHECKS,
          confidence: 0.2,
        },
      ],
    });

    const defaultRun = await evaluateFiles(
      [targetFile],
      createBaseOptions([prompt])
    );
    expect(defaultRun.totalWarnings).toBe(1);

    process.env.VECTORLINT_CONFIDENCE_THRESHOLD = "0.0";
    EVALUATE_MOCK.mockResolvedValue({
      type: EvaluationType.CHECK,
      final_score: 8,
      percentage: 80,
      violation_count: 2,
      items: [],
      severity: Severity.WARNING,
      message: "Found issues",
      violations: [
        {
          line: 1,
          analysis: "Issue 1",
          suggestion: "Suggestion 1",
          fix: "Fix 1",
          quoted_text: "Alpha text",
          context_before: "",
          context_after: "",
          rule_quote: "Rule quote",
          checks: FULLY_SUPPORTED_CHECKS,
          confidence: 0.9,
        },
        {
          line: 2,
          analysis: "Issue 2",
          suggestion: "Suggestion 2",
          fix: "Fix 2",
          quoted_text: "Beta text",
          context_before: "",
          context_after: "",
          rule_quote: "Rule quote",
          checks: FULLY_SUPPORTED_CHECKS,
          confidence: 0.2,
        },
      ],
    });

    const zeroThresholdRun = await evaluateFiles(
      [targetFile],
      createBaseOptions([prompt])
    );
    expect(zeroThresholdRun.totalWarnings).toBe(2);
  });

  it("does not mark severity error when no check violations are surfaced", async () => {
    const targetFile = createTempFile("Alpha text\n");
    const prompt = createPrompt({
      id: "CheckErrorPrompt",
      name: "Check Error Prompt",
      type: "check",
      severity: Severity.ERROR,
    });

    EVALUATE_MOCK.mockResolvedValue({
      type: EvaluationType.CHECK,
      final_score: 2,
      percentage: 20,
      violation_count: 1,
      items: [],
      severity: Severity.ERROR,
      message: "Found issue",
      violations: [
        {
          line: 1,
          analysis: "Issue 1",
          suggestion: "Suggestion 1",
          fix: "Fix 1",
          quoted_text: "Alpha text",
          context_before: "",
          context_after: "",
          rule_quote: "Rule quote",
          checks: FULLY_SUPPORTED_CHECKS,
          confidence: 0.2,
        },
      ],
    });

    const defaultRun = await evaluateFiles(
      [targetFile],
      createBaseOptions([prompt])
    );
    expect(defaultRun.totalErrors).toBe(0);
    expect(defaultRun.hadSeverityErrors).toBe(false);

    process.env.VECTORLINT_CONFIDENCE_THRESHOLD = "0.0";
    EVALUATE_MOCK.mockResolvedValue({
      type: EvaluationType.CHECK,
      final_score: 2,
      percentage: 20,
      violation_count: 1,
      items: [],
      severity: Severity.ERROR,
      message: "Found issue",
      violations: [
        {
          line: 1,
          analysis: "Issue 1",
          suggestion: "Suggestion 1",
          fix: "Fix 1",
          quoted_text: "Alpha text",
          context_before: "",
          context_after: "",
          rule_quote: "Rule quote",
          checks: FULLY_SUPPORTED_CHECKS,
          confidence: 0.2,
        },
      ],
    });

    const zeroThresholdRun = await evaluateFiles(
      [targetFile],
      createBaseOptions([prompt])
    );
    expect(zeroThresholdRun.totalErrors).toBe(1);
    expect(zeroThresholdRun.hadSeverityErrors).toBe(true);
  });

  it("filters low-confidence judge violations from CLI counts by default", async () => {
    const targetFile = createTempFile("Alpha text\nBeta text\n");
    const prompt = createPrompt({
      id: "JudgePrompt",
      name: "Judge Prompt",
      type: "judge",
      criteria: [{ id: "Clarity", name: "Clarity", weight: 1 }],
      severity: Severity.WARNING,
    });

    EVALUATE_MOCK.mockResolvedValue({
      type: EvaluationType.JUDGE,
      final_score: 5,
      criteria: [
        {
          name: "Clarity",
          weight: 1,
          score: 2,
          normalized_score: 5,
          weighted_points: 1,
          summary: "Needs work",
          reasoning: "Reasoning",
          violations: [
            {
              line: 1,
              quoted_text: "Alpha text",
              context_before: "",
              context_after: "",
              description: "Issue 1",
              analysis: "Issue 1",
              suggestion: "Suggestion 1",
              fix: "Fix 1",
              rule_quote: "Rule quote",
              checks: FULLY_SUPPORTED_CHECKS,
              check_notes: {
                rule_supports_claim: "",
                evidence_exact: "",
                context_supports_violation: "",
                plausible_non_violation: "",
                fix_is_drop_in: "",
                fix_preserves_meaning: "",
              },
              confidence: 0.9,
            },
            {
              line: 2,
              quoted_text: "Beta text",
              context_before: "",
              context_after: "",
              description: "Issue 2",
              analysis: "Issue 2",
              suggestion: "Suggestion 2",
              fix: "Fix 2",
              rule_quote: "Rule quote",
              checks: FULLY_SUPPORTED_CHECKS,
              check_notes: {
                rule_supports_claim: "",
                evidence_exact: "",
                context_supports_violation: "",
                plausible_non_violation: "",
                fix_is_drop_in: "",
                fix_preserves_meaning: "",
              },
              confidence: 0.2,
            },
          ],
        },
      ],
    });

    const defaultRun = await evaluateFiles(
      [targetFile],
      createBaseOptions([prompt])
    );
    expect(defaultRun.totalWarnings).toBe(1);

    process.env.VECTORLINT_CONFIDENCE_THRESHOLD = "0.0";
    EVALUATE_MOCK.mockResolvedValue({
      type: EvaluationType.JUDGE,
      final_score: 5,
      criteria: [
        {
          name: "Clarity",
          weight: 1,
          score: 2,
          normalized_score: 5,
          weighted_points: 1,
          summary: "Needs work",
          reasoning: "Reasoning",
          violations: [
            {
              line: 1,
              quoted_text: "Alpha text",
              context_before: "",
              context_after: "",
              description: "Issue 1",
              analysis: "Issue 1",
              suggestion: "Suggestion 1",
              fix: "Fix 1",
              rule_quote: "Rule quote",
              checks: FULLY_SUPPORTED_CHECKS,
              check_notes: {
                rule_supports_claim: "",
                evidence_exact: "",
                context_supports_violation: "",
                plausible_non_violation: "",
                fix_is_drop_in: "",
                fix_preserves_meaning: "",
              },
              confidence: 0.9,
            },
            {
              line: 2,
              quoted_text: "Beta text",
              context_before: "",
              context_after: "",
              description: "Issue 2",
              analysis: "Issue 2",
              suggestion: "Suggestion 2",
              fix: "Fix 2",
              rule_quote: "Rule quote",
              checks: FULLY_SUPPORTED_CHECKS,
              check_notes: {
                rule_supports_claim: "",
                evidence_exact: "",
                context_supports_violation: "",
                plausible_non_violation: "",
                fix_is_drop_in: "",
                fix_preserves_meaning: "",
              },
              confidence: 0.2,
            },
          ],
        },
      ],
    });

    const zeroThresholdRun = await evaluateFiles(
      [targetFile],
      createBaseOptions([prompt])
    );
    expect(zeroThresholdRun.totalWarnings).toBe(2);
  });
});
