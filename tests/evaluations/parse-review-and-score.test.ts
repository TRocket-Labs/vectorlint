import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { readdirSync, readFileSync } from "node:fs";
import type { SessionLog } from "../../.codex/skills/agentic-content-review/scripts/parse-review-and-score.js";

import {
  resolveRuleName,
  buildSessionLog,
  writeSessionLog,
} from "../../.codex/skills/agentic-content-review/scripts/parse-review-and-score.js";
import { execSync } from "node:child_process";

let tmpDir: string;

beforeEach(() => {
  tmpDir = path.join(os.tmpdir(), "vlint-test-" + Date.now());
  mkdirSync(tmpDir, { recursive: true });
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("resolveRuleName", () => {
  it("returns name from rule-index.yml when matched by path", () => {
    const ruleDir = path.join(tmpDir, "rules");
    mkdirSync(ruleDir);
    writeFileSync(path.join(ruleDir, "ai-patterns.md"), "# AI Patterns rule");
    writeFileSync(
      path.join(ruleDir, "rule-index.yml"),
      `pack: default\nactive: true\nrules:\n  - id: ai-patterns\n    name: AI Patterns\n    path: ai-patterns.md\n    active: true\n`
    );
    const rulePath = path.join(ruleDir, "ai-patterns.md");
    expect(resolveRuleName(rulePath)).toBe("AI Patterns");
  });

  it("falls back to basename when rule-index.yml is missing", () => {
    const ruleDir = path.join(tmpDir, "rules");
    mkdirSync(ruleDir);
    writeFileSync(path.join(ruleDir, "wordiness.md"), "# Wordiness rule");
    const rulePath = path.join(ruleDir, "wordiness.md");
    expect(resolveRuleName(rulePath)).toBe("wordiness");
  });

  it("falls back to basename when rule not found in index", () => {
    const ruleDir = path.join(tmpDir, "rules");
    mkdirSync(ruleDir);
    writeFileSync(
      path.join(ruleDir, "rule-index.yml"),
      `pack: default\nactive: true\nrules:\n  - id: other\n    name: Other Rule\n    path: other.md\n    active: true\n`
    );
    writeFileSync(path.join(ruleDir, "wordiness.md"), "# Wordiness rule");
    const rulePath = path.join(ruleDir, "wordiness.md");
    expect(resolveRuleName(rulePath)).toBe("wordiness");
  });
});

describe("buildSessionLog", () => {
  it("builds log with correct top-level fields", () => {
    const finding = {
      index: 0,
      rulePath: path.join(tmpDir, "rules", "ai-patterns.md"),
      sourceFile: path.join(tmpDir, "docs", "quickstart.md"),
      line: 12,
      evidenceQuote: "leveraging synergies",
      ruleQuote: "Flag AI-like phrasing",
      flagReasoning: "matches pattern",
      issue: "AI phrasing detected",
      plausibleNonViolation: "could be intentional",
      contextSupportsViolation: true,
      suggestion: "Rewrite directly",
      confidence: 0.85,
    };
    const timestamp = "2026-04-22T14:32:00Z";
    const log = buildSessionLog([finding], 423, 3, 8.5, timestamp);
    expect(log.sessionId).toBe(timestamp);
    expect(log.sourceFile).toBe(finding.sourceFile);
    expect(log.wordCount).toBe(423);
    expect(log.findingCount).toBe(3);
    expect(log.score).toBe(8.5);
    expect(log.findings).toHaveLength(1);
  });

  it("maps finding fields 1:1 with ruleName before rulePath", () => {
    const ruleDir = path.join(tmpDir, "rules");
    mkdirSync(ruleDir, { recursive: true });
    writeFileSync(
      path.join(ruleDir, "rule-index.yml"),
      `pack: default\nactive: true\nrules:\n  - id: ai-patterns\n    name: AI Patterns\n    path: ai-patterns.md\n    active: true\n`
    );
    writeFileSync(path.join(ruleDir, "ai-patterns.md"), "# rule");
    const finding = {
      index: 0,
      rulePath: path.join(ruleDir, "ai-patterns.md"),
      sourceFile: "/docs/quickstart.md",
      line: 5,
      evidenceQuote: "quote",
      ruleQuote: "rule quote",
      flagReasoning: "reason",
      issue: "issue text",
      plausibleNonViolation: "benign",
      contextSupportsViolation: false,
      suggestion: "fix it",
      confidence: 0.7,
    };
    const log = buildSessionLog([finding], 100, 1, 9.0, "2026-04-22T14:32:00Z");
    const f = log.findings[0]!;
    expect(Object.keys(f)[0]).toBe("ruleName");
    expect(Object.keys(f)[1]).toBe("rulePath");
    expect(f.ruleName).toBe("AI Patterns");
    expect(f.confidence).toBe(0.7);
  });

  it("derives sourceFile from first finding when findings exist", () => {
    const finding = {
      index: 0,
      rulePath: "/rules/r.md",
      sourceFile: "/docs/overview.md",
      line: 1,
      evidenceQuote: "e",
      ruleQuote: "r",
      flagReasoning: "f",
      issue: "i",
      plausibleNonViolation: "p",
      contextSupportsViolation: true,
      suggestion: "s",
      confidence: 0.9,
    };
    const log = buildSessionLog([finding], 50, 1, 9.5, "2026-04-22T14:32:00Z");
    expect(log.sourceFile).toBe("/docs/overview.md");
  });

  it("returns empty sourceFile when findings array is empty", () => {
    const log = buildSessionLog([], 0, 0, 10, "2026-04-22T14:32:00Z");
    expect(log.sourceFile).toBe("");
    expect(log.findings).toHaveLength(0);
  });
});

describe("writeSessionLog", () => {
  it("creates sessions directory and writes the log file", () => {
    const sessionsDir = path.join(tmpDir, ".vlint", "sessions");
    const log: SessionLog = {
      sessionId: "2026-04-22T14:32:00Z",
      sourceFile: "docs/quickstart.md",
      wordCount: 100,
      findingCount: 1,
      score: 9.0,
      findings: [],
    };
    writeSessionLog(log, sessionsDir);
    const files = readdirSync(sessionsDir);
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/^2026-04-22T14-32-00Z-quickstart\.json$/);
  });

  it("file content is valid JSON matching the log shape", () => {
    const sessionsDir = path.join(tmpDir, ".vlint", "sessions");
    const log: SessionLog = {
      sessionId: "2026-04-22T14:32:00Z",
      sourceFile: "/abs/path/to/overview.md",
      wordCount: 200,
      findingCount: 0,
      score: 10.0,
      findings: [],
    };
    writeSessionLog(log, sessionsDir);
    const files = readdirSync(sessionsDir);
    const content = readFileSync(path.join(sessionsDir, files[0]!), "utf8");
    const parsed = JSON.parse(content);
    expect(parsed.sessionId).toBe("2026-04-22T14:32:00Z");
    expect(parsed.sourceFile).toBe("/abs/path/to/overview.md");
    expect(parsed.score).toBe(10.0);
    expect(Array.isArray(parsed.findings)).toBe(true);
  });

  it("replaces colons with hyphens in timestamp portion of filename", () => {
    const sessionsDir = path.join(tmpDir, ".vlint", "sessions");
    const log: SessionLog = {
      sessionId: "2026-04-22T09:05:30Z",
      sourceFile: "docs/config.md",
      wordCount: 50,
      findingCount: 0,
      score: 10.0,
      findings: [],
    };
    writeSessionLog(log, sessionsDir);
    const files = readdirSync(sessionsDir);
    expect(files[0]).toMatch(/^2026-04-22T09-05-30Z-config\.json$/);
  });
});

describe("--write-log flag integration", () => {
  it("creates a session log file in .vlint/sessions when flag is passed", () => {
    const ruleDir = path.join(tmpDir, "rules", "default");
    const sourceDir = path.join(tmpDir, "docs");
    mkdirSync(ruleDir, { recursive: true });
    mkdirSync(sourceDir, { recursive: true });

    writeFileSync(path.join(sourceDir, "test-doc.md"), "This leverages synergies to unlock value.");
    writeFileSync(path.join(ruleDir, "ai-patterns.md"), "Flag AI-generated phrasing like 'leveraging synergies'.");
    writeFileSync(
      path.join(ruleDir, "rule-index.yml"),
      `pack: default\nactive: true\nrules:\n  - id: ai-patterns\n    name: AI Patterns\n    path: ai-patterns.md\n    active: true\n`
    );

    const reviewMd = [
      "### Finding",
      `- Rule path: \`${path.join(ruleDir, "ai-patterns.md")}\``,
      `- Source file: \`${path.join(sourceDir, "test-doc.md")}\``,
      "- Line: `1`",
      "- Evidence quote: `leverages synergies to unlock value`",
      "- Rule quote: `Flag AI-generated phrasing like 'leveraging synergies'`",
      "- Flag reasoning: `matches AI phrasing pattern`",
      "- Issue: `AI-like phrasing detected`",
      "- Plausible non-violation: `could be intentional industry language`",
      "- Context supports violation: `true`",
      "- Suggestion: `Rewrite to be more direct`",
      "- Confidence: `0.85`",
    ].join("\n");

    const reviewPath = path.join(tmpDir, "review.md");
    writeFileSync(reviewPath, reviewMd);

    execSync(
      `npx tsx ${path.resolve(".codex/skills/agentic-content-review/scripts/parse-review-and-score.ts")} ${reviewPath} --write-log`,
      { cwd: tmpDir, env: { ...process.env } }
    );

    const sessionsDir = path.join(tmpDir, ".vlint", "sessions");
    const files = readdirSync(sessionsDir);
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/test-doc\.json$/);

    const log = JSON.parse(readFileSync(path.join(sessionsDir, files[0]!), "utf8"));
    expect(log.findings[0].ruleName).toBe("AI Patterns");
    expect(log.findings[0].confidence).toBe(0.85);
  });
});
