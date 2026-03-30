import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { evaluateFiles } from "../src/cli/orchestrator";
import { OutputFormat, type EvaluationOptions } from "../src/cli/types";
import { EvaluationType, Severity } from "../src/evaluators/types";
import type { Result } from "../src/output/json-formatter";
import type { PromptFile } from "../src/prompts/prompt-loader";
import type { ValeOutput } from "../src/schemas/vale-responses";
import type { JudgeResult, RawCheckResult } from "../src/prompts/schema";

const { EVALUATE_MOCK } = vi.hoisted(() => ({
  EVALUATE_MOCK: vi.fn(),
}));

type CheckViolation = RawCheckResult["violations"][number];
type JudgeViolation = JudgeResult["criteria"][number]["violations"][number];

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

const EMPTY_CHECK_NOTES: JudgeViolation["check_notes"] = {
  rule_supports_claim: "",
  evidence_exact: "",
  context_supports_violation: "",
  plausible_non_violation: "",
  fix_is_drop_in: "",
  fix_preserves_meaning: "",
};

function makeCheckViolation(
  overrides: Partial<CheckViolation> = {}
): CheckViolation {
  return {
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
    ...overrides,
  };
}

function makeJudgeViolation(
  overrides: Partial<JudgeViolation> = {}
): JudgeViolation {
  const { check_notes: checkNotesOverrides, ...rest } = overrides;
  return {
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
      ...EMPTY_CHECK_NOTES,
      ...(checkNotesOverrides ?? {}),
    },
    confidence: 0.9,
    ...rest,
  };
}

function makeCheckResult(params: {
  violations: CheckViolation[];
  wordCount?: number;
}): RawCheckResult {
  return {
    type: EvaluationType.CHECK,
    violations: params.violations,
    word_count: params.wordCount ?? 100,
  };
}

function makeJudgeResult(violations: JudgeViolation[]): JudgeResult {
  return {
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
        violations,
      },
    ],
  };
}

describe("CLI violation filtering", () => {
  const originalThreshold = process.env.CONFIDENCE_THRESHOLD;
  const originalIsTTY = Object.getOwnPropertyDescriptor(process.stderr, "isTTY");

  beforeEach(() => {
    EVALUATE_MOCK.mockReset();
    delete process.env.CONFIDENCE_THRESHOLD;
    Object.defineProperty(process.stderr, "isTTY", {
      configurable: true,
      value: false,
    });
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    if (originalThreshold === undefined) {
      delete process.env.CONFIDENCE_THRESHOLD;
    } else {
      process.env.CONFIDENCE_THRESHOLD = originalThreshold;
    }
    if (originalIsTTY) {
      Object.defineProperty(process.stderr, "isTTY", originalIsTTY);
    }
    vi.restoreAllMocks();
  });

  it("shows linting spinner text in line mode and ends with a newline", async () => {
    Object.defineProperty(process.stderr, "isTTY", {
      configurable: true,
      value: true,
    });

    const targetFile = createTempFile("Alpha text\n");
    const prompt = createPrompt({
      id: "CheckPrompt",
      name: "Check Prompt",
      type: "check",
      severity: Severity.WARNING,
    });

    EVALUATE_MOCK.mockResolvedValue(
      makeCheckResult({
        violations: [],
      })
    );

    const stderrSpy = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    await evaluateFiles([targetFile], createBaseOptions([prompt]));

    const stderrOutput = stderrSpy.mock.calls.map((call) => String(call[0])).join("");
    expect(stderrOutput).toContain("◆ linting....");
    expect(stderrOutput).toContain("◆ done in");
    expect(stderrOutput).toContain("\n");
  });

  it("suppresses lint progress output in print mode", async () => {
    Object.defineProperty(process.stderr, "isTTY", {
      configurable: true,
      value: true,
    });

    const targetFile = createTempFile("Alpha text\n");
    const prompt = createPrompt({
      id: "CheckPrompt",
      name: "Check Prompt",
      type: "check",
      severity: Severity.WARNING,
    });

    EVALUATE_MOCK.mockResolvedValue(
      makeCheckResult({
        violations: [],
      })
    );

    const stderrSpy = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    await evaluateFiles([targetFile], {
      ...createBaseOptions([prompt]),
      print: true,
    });

    expect(stderrSpy).not.toHaveBeenCalled();
  });

  it("filters low-confidence check violations from CLI counts by default", async () => {
    const targetFile = createTempFile("Alpha text\nBeta text\n");
    const prompt = createPrompt({
      id: "CheckPrompt",
      name: "Check Prompt",
      type: "check",
      severity: Severity.WARNING,
    });

    EVALUATE_MOCK.mockResolvedValue(
      makeCheckResult({
        violations: [
          makeCheckViolation(),
          makeCheckViolation({
            line: 2,
            analysis: "Issue 2",
            suggestion: "Suggestion 2",
            fix: "Fix 2",
            quoted_text: "Beta text",
            confidence: 0.2,
          }),
        ],
      })
    );

    const defaultRun = await evaluateFiles(
      [targetFile],
      createBaseOptions([prompt])
    );
    expect(defaultRun.totalWarnings).toBe(1);

    process.env.CONFIDENCE_THRESHOLD = "0.0";
    EVALUATE_MOCK.mockResolvedValue(
      makeCheckResult({
        violations: [
          makeCheckViolation(),
          makeCheckViolation({
            line: 2,
            analysis: "Issue 2",
            suggestion: "Suggestion 2",
            fix: "Fix 2",
            quoted_text: "Beta text",
            confidence: 0.2,
          }),
        ],
      })
    );

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

    EVALUATE_MOCK.mockResolvedValue(
      makeCheckResult({
        violations: [
          makeCheckViolation({
            confidence: 0.2,
          }),
        ],
      })
    );

    const defaultRun = await evaluateFiles(
      [targetFile],
      createBaseOptions([prompt])
    );
    expect(defaultRun.totalErrors).toBe(0);
    expect(defaultRun.hadSeverityErrors).toBe(false);

    process.env.CONFIDENCE_THRESHOLD = "0.0";
    EVALUATE_MOCK.mockResolvedValue(
      makeCheckResult({
        violations: [
          makeCheckViolation({
            confidence: 0.2,
          }),
        ],
      })
    );

    const zeroThresholdRun = await evaluateFiles(
      [targetFile],
      createBaseOptions([prompt])
    );
    expect(zeroThresholdRun.totalErrors).toBe(1);
    expect(zeroThresholdRun.hadSeverityErrors).toBe(true);
  });

  it("score reflects only surfaced violations, not filtered-out ones", async () => {
    // 100-word file: 2 violations from model, 1 fails confidence gate
    // With default threshold, only 1 violation surfaces
    // Density: 1/100 * 100 * 10 = 10 penalty → score = 9.0
    // If bug were present (scoring all 2): 2/100 * 100 * 10 = 20 penalty → score = 8.0

    const content = new Array(100).fill("word").join(" ") + "\n";
    const targetFile = createTempFile(content);

    const prompt = createPrompt({
      id: "ScorePrompt",
      name: "Score Prompt",
      type: "check",
      severity: Severity.WARNING,
    });

    EVALUATE_MOCK.mockResolvedValue(
      makeCheckResult({
        violations: [
          makeCheckViolation({ quoted_text: content.split(" ")[0] ?? "word" }),
          makeCheckViolation({
            quoted_text: content.split(" ")[1] ?? "word",
            confidence: 0.2,  // fails confidence gate — should NOT affect score
          }),
        ],
        wordCount: 100,
      })
    );

    const logCalls: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...args) => {
      logCalls.push(args.map(String).join(" "));
    });

    await evaluateFiles([targetFile], createBaseOptions([prompt]));

    // Score should reflect 1 surfaced violation, not 2
    const scoreLine = logCalls.find(l => l.includes("/10"));
    expect(scoreLine).toBeDefined();
    expect(scoreLine).toContain("9.0/10");
    expect(scoreLine).not.toContain("8.0/10");
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

    EVALUATE_MOCK.mockResolvedValue(
      makeJudgeResult([
        makeJudgeViolation(),
        makeJudgeViolation({
          line: 2,
          quoted_text: "Beta text",
          description: "Issue 2",
          analysis: "Issue 2",
          suggestion: "Suggestion 2",
          fix: "Fix 2",
          confidence: 0.2,
        }),
      ])
    );

    const defaultRun = await evaluateFiles(
      [targetFile],
      createBaseOptions([prompt])
    );
    expect(defaultRun.totalWarnings).toBe(1);

    process.env.CONFIDENCE_THRESHOLD = "0.0";
    EVALUATE_MOCK.mockResolvedValue(
      makeJudgeResult([
        makeJudgeViolation(),
        makeJudgeViolation({
          line: 2,
          quoted_text: "Beta text",
          description: "Issue 2",
          analysis: "Issue 2",
          suggestion: "Suggestion 2",
          fix: "Fix 2",
          confidence: 0.2,
        }),
      ])
    );

    const zeroThresholdRun = await evaluateFiles(
      [targetFile],
      createBaseOptions([prompt])
    );
    expect(zeroThresholdRun.totalWarnings).toBe(2);
  });

  it("does not emit dummy issues in JSON output when no violations are surfaced", async () => {
    const targetFile = createTempFile("Alpha text\n");
    const prompt = createPrompt({
      id: "CheckJsonPrompt",
      name: "Check JSON Prompt",
      type: "check",
      severity: Severity.WARNING,
    });

    EVALUATE_MOCK.mockResolvedValue(
      makeCheckResult({
        violations: [
          makeCheckViolation({
            confidence: 0.2,
          }),
        ],
      })
    );

    const run = await evaluateFiles([targetFile], {
      ...createBaseOptions([prompt]),
      outputFormat: OutputFormat.Json,
    });

    expect(run.totalWarnings).toBe(0);

    const parsed = JSON.parse(
      String(vi.mocked(console.log).mock.calls.at(-1)?.[0])
    ) as Result;
    const allIssues = Object.values(parsed.files).flatMap((file) => file.issues);

    expect(allIssues).toHaveLength(0);
    expect(JSON.stringify(parsed)).not.toContain("No issues found");
  });

  it("does not emit dummy issues in Vale JSON output when no violations are surfaced", async () => {
    const targetFile = createTempFile("Alpha text\n");
    const prompt = createPrompt({
      id: "CheckValeJsonPrompt",
      name: "Check Vale JSON Prompt",
      type: "check",
      severity: Severity.WARNING,
    });

    EVALUATE_MOCK.mockResolvedValue(
      makeCheckResult({
        violations: [
          makeCheckViolation({
            confidence: 0.2,
          }),
        ],
      })
    );

    const run = await evaluateFiles([targetFile], {
      ...createBaseOptions([prompt]),
      outputFormat: OutputFormat.ValeJson,
    });

    expect(run.totalWarnings).toBe(0);

    const parsed = JSON.parse(
      String(vi.mocked(console.log).mock.calls.at(-1)?.[0])
    ) as ValeOutput;
    const allIssues = Object.values(parsed).flat();

    expect(allIssues).toHaveLength(0);
    expect(JSON.stringify(parsed)).not.toContain("No issues found");
  });
});
