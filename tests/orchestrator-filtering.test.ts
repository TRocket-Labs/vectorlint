import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { evaluateFiles } from "../src/cli/orchestrator";
import { OutputFormat, type EvaluationOptions } from "../src/cli/types";
import { Severity } from "../src/evaluators/types";
import type { Result } from "../src/output/json-formatter";
import type { PromptFile } from "../src/prompts/prompt-loader";
import type { ValeOutput } from "../src/schemas/vale-responses";
import type { PromptEvaluationResult } from "../src/prompts/schema";

const { EVALUATE_MOCK } = vi.hoisted(() => ({
  EVALUATE_MOCK: vi.fn(),
}));

type Violation = PromptEvaluationResult["violations"][number];

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

function makeViolation(
  overrides: Partial<Violation> = {}
): Violation {
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

function makeResult(params: {
  violations: Violation[];
  wordCount?: number;
}): PromptEvaluationResult {
  return {
    violations: params.violations,
    word_count: params.wordCount ?? 100,
  };
}

describe("CLI violation filtering", () => {
  const originalThreshold = process.env.CONFIDENCE_THRESHOLD;

  beforeEach(() => {
    EVALUATE_MOCK.mockReset();
    delete process.env.CONFIDENCE_THRESHOLD;
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
    vi.restoreAllMocks();
  });

  it("filters low-confidence violations from CLI counts by default", async () => {
    const targetFile = createTempFile("Alpha text\nBeta text\n");
    const prompt = createPrompt({
      id: "RulePrompt",
      name: "Rule Prompt",
      severity: Severity.WARNING,
    });

    EVALUATE_MOCK.mockResolvedValue(
      makeResult({
        violations: [
          makeViolation(),
          makeViolation({
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
      makeResult({
        violations: [
          makeViolation(),
          makeViolation({
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

  it("does not mark severity error when no violations are surfaced", async () => {
    const targetFile = createTempFile("Alpha text\n");
    const prompt = createPrompt({
      id: "CheckErrorPrompt",
      name: "Check Error Prompt",
      severity: Severity.ERROR,
    });

    EVALUATE_MOCK.mockResolvedValue(
      makeResult({
        violations: [
          makeViolation({
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
      makeResult({
        violations: [
          makeViolation({
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
    const content = new Array(100).fill("word").join(" ") + "\n";
    const targetFile = createTempFile(content);

    const prompt = createPrompt({
      id: "ScorePrompt",
      name: "Score Prompt",
      severity: Severity.WARNING,
    });

    EVALUATE_MOCK.mockResolvedValue(
      makeResult({
        violations: [
          makeViolation({ quoted_text: content.split(" ")[0] ?? "word" }),
          makeViolation({
            quoted_text: content.split(" ")[1] ?? "word",
            confidence: 0.2,
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

    const scoreLine = logCalls.find(l => l.includes("/10"));
    expect(scoreLine).toBeDefined();
    expect(scoreLine).toContain("9.0/10");
    expect(scoreLine).not.toContain("8.0/10");
  });

  it("does not emit dummy issues in JSON output when no violations are surfaced", async () => {
    const targetFile = createTempFile("Alpha text\n");
    const prompt = createPrompt({
      id: "CheckJsonPrompt",
      name: "Check JSON Prompt",
      severity: Severity.WARNING,
    });

    EVALUATE_MOCK.mockResolvedValue(
      makeResult({
        violations: [
          makeViolation({
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
      severity: Severity.WARNING,
    });

    EVALUATE_MOCK.mockResolvedValue(
      makeResult({
        violations: [
          makeViolation({
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
