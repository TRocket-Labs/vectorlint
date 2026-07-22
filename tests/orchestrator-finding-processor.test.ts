import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { evaluateFiles } from "../src/cli/orchestrator";
import { OutputFormat, type EvaluationOptions } from "../src/cli/types";
import { Severity } from "../src/evaluators/types";
import type { Result } from "../src/output/json-formatter";
import type { ValeOutput } from "../src/schemas/vale-responses";
import type { PromptFile } from "../src/prompts/prompt-loader";
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

const FULLY_SUPPORTED_CHECKS = {
  rule_supports_claim: true,
  evidence_exact: true,
  context_supports_violation: true,
  plausible_non_violation: false,
  fix_is_drop_in: true,
  fix_preserves_meaning: true,
} as const;

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
  const dir = mkdtempSync(path.join(tmpdir(), "vectorlint-finding-proc-"));
  const filePath = path.join(dir, "input.md");
  writeFileSync(filePath, content);
  return filePath;
}

function makeViolation(
  overrides: Partial<Violation> = {}
): Violation {
  return {
    line: 1,
    analysis: "Issue 1",
    message: "Issue 1",
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

describe("evaluation via the shared finding processor", () => {
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

  it("reports fully locatable findings, score, and counts unchanged", async () => {
    const targetFile = createTempFile("Alpha text\nBeta text\n");
    const prompt = createPrompt({
      id: "RulePrompt",
      name: "Rule Prompt",
      severity: Severity.WARNING,
    });

    EVALUATE_MOCK.mockResolvedValue(
      makeResult({
        violations: [
          makeViolation({ message: "First issue", analysis: "First issue" }),
          makeViolation({
            line: 2,
            quoted_text: "Beta text",
            message: "Second issue",
            analysis: "Second issue",
            suggestion: "Suggestion 2",
            fix: "Fix 2",
          }),
        ],
        wordCount: 100,
      })
    );

    const logCalls: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...args) => {
      logCalls.push(args.map(String).join(" "));
    });

    const run = await evaluateFiles([targetFile], createBaseOptions([prompt]));

    expect(run.totalWarnings).toBe(2);
    expect(run.totalErrors).toBe(0);
    expect(run.hadOperationalErrors).toBe(false);

    const scoreLine = logCalls.find((l) => l.includes("/10"));
    expect(scoreLine).toBeDefined();
    expect(scoreLine).toContain("8.0/10");
    expect(scoreLine).toContain("RulePrompt");
  });

  it("counts only verified findings and excludes unanchored quotes from the score", async () => {
    const targetFile = createTempFile("Alpha text\n");
    const prompt = createPrompt({
      id: "CountingFixPrompt",
      name: "Counting Fix Prompt",
      severity: Severity.WARNING,
    });

    EVALUATE_MOCK.mockResolvedValue(
      makeResult({
        violations: [
          makeViolation({ quoted_text: "Alpha text" }),
          makeViolation({
            line: 9,
            quoted_text: "this quote is not anywhere in the content",
            message: "Ghost issue",
            analysis: "Ghost issue",
          }),
        ],
        wordCount: 100,
      })
    );

    const logCalls: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...args) => {
      logCalls.push(args.map(String).join(" "));
    });

    const run = await evaluateFiles([targetFile], createBaseOptions([prompt]));

    expect(run.totalWarnings).toBe(1);
    expect(run.hadOperationalErrors).toBe(false);

    const scoreLine = logCalls.find((l) => l.includes("/10"));
    expect(scoreLine).toBeDefined();
    expect(scoreLine).toContain("9.0/10");
  });

  it("does not flag severity errors when no finding can be verified", async () => {
    const targetFile = createTempFile("Alpha text\n");
    const prompt = createPrompt({
      id: "ErrorNoVerifiedPrompt",
      name: "Error No Verified Prompt",
      severity: Severity.ERROR,
    });

    EVALUATE_MOCK.mockResolvedValue(
      makeResult({
        violations: [
          makeViolation({
            line: 9,
            quoted_text: "nowhere to be found",
            message: "Ghost",
            analysis: "Ghost",
          }),
        ],
        wordCount: 100,
      })
    );

    const run = await evaluateFiles([targetFile], createBaseOptions([prompt]));

    expect(run.totalErrors).toBe(0);
    expect(run.hadSeverityErrors).toBe(false);
    expect(run.hadOperationalErrors).toBe(false);
  });

  it("flags severity errors when verified error-severity findings exist", async () => {
    const targetFile = createTempFile("Alpha text\n");
    const prompt = createPrompt({
      id: "ErrorVerifiedPrompt",
      name: "Error Verified Prompt",
      severity: Severity.ERROR,
    });

    EVALUATE_MOCK.mockResolvedValue(
      makeResult({
        violations: [makeViolation({ quoted_text: "Alpha text" })],
        wordCount: 10,
      })
    );

    const run = await evaluateFiles([targetFile], createBaseOptions([prompt]));

    expect(run.totalErrors).toBe(1);
    expect(run.hadSeverityErrors).toBe(true);
  });

  it("emits verified findings with anchored location through the JSON sink", async () => {
    const targetFile = createTempFile("Alpha text\nBeta text\n");
    const prompt = createPrompt({
      id: "CheckJsonPrompt",
      name: "Check JSON Prompt",
      severity: Severity.WARNING,
    });

    EVALUATE_MOCK.mockResolvedValue(
      makeResult({
        violations: [
          makeViolation({ message: "First", analysis: "First" }),
          makeViolation({
            line: 2,
            quoted_text: "Beta text",
            message: "Second",
            analysis: "Second",
          }),
        ],
        wordCount: 100,
      })
    );

    await evaluateFiles([targetFile], {
      ...createBaseOptions([prompt]),
      outputFormat: OutputFormat.Json,
    });

    const parsed = JSON.parse(
      String(vi.mocked(console.log).mock.calls.at(-1)?.[0])
    ) as Result;
    const issues = Object.values(parsed.files).flatMap((file) => file.issues);

    expect(issues).toHaveLength(2);
    expect(issues[0]).toMatchObject({
      line: 1,
      column: 1,
      severity: Severity.WARNING,
      message: "First",
      rule: "TestPack.CheckJsonPrompt",
      match: "Alpha text",
    });
    expect(issues[1]).toMatchObject({
      line: 2,
      message: "Second",
      match: "Beta text",
    });
  });

  it("omits unanchored quotes from the Vale JSON output", async () => {
    const targetFile = createTempFile("Alpha text\n");
    const prompt = createPrompt({
      id: "CheckValePrompt",
      name: "Check Vale Prompt",
      severity: Severity.WARNING,
    });

    EVALUATE_MOCK.mockResolvedValue(
      makeResult({
        violations: [
          makeViolation({ quoted_text: "Alpha text" }),
          makeViolation({
            line: 9,
            quoted_text: "missing quote",
            message: "Ghost",
            analysis: "Ghost",
          }),
        ],
        wordCount: 100,
      })
    );

    await evaluateFiles([targetFile], {
      ...createBaseOptions([prompt]),
      outputFormat: OutputFormat.ValeJson,
    });

    const parsed = JSON.parse(
      String(vi.mocked(console.log).mock.calls.at(-1)?.[0])
    ) as ValeOutput;
    const issues = Object.values(parsed).flat();

    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      Check: "TestPack.CheckValePrompt",
      Line: 1,
      Match: "Alpha text",
      Severity: "warning",
    });
  });
});
