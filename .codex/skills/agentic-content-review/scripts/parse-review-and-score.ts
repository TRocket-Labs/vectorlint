#!/usr/bin/env tsx
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import path from "node:path";
import process from "node:process";

type Finding = {
  index: number;
  rulePath: string;
  sourceFile: string;
  line: number;
  evidenceQuote: string;
  ruleQuote: string;
  flagReasoning: string;
  issue: string;
  plausibleNonViolation: string;
  contextSupportsViolation: boolean;
  suggestion: string;
  confidence: number;
};

type Warning = {
  type: string;
  message: string;
  findingIndexes?: number[];
};

type Output = {
  valid: boolean;
  findingCount: number;
  wordCount: number;
  score: number;
  findings: Finding[];
  warnings: Warning[];
  errors: string[];
};

const REQUIRED_FIELDS = [
  "Rule path",
  "Source file",
  "Line",
  "Evidence quote",
  "Rule quote",
  "Flag reasoning",
  "Issue",
  "Plausible non-violation",
  "Context supports violation",
  "Suggestion",
  "Confidence",
] as const;

type FieldName = (typeof REQUIRED_FIELDS)[number];

type RawFinding = Record<FieldName, string>;

function stripWrapper(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith("`") && trimmed.endsWith("`")) ||
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function normalizeAnchor(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function countWords(content: string): number {
  const trimmed = content.trim();
  return trimmed === "" ? 0 : trimmed.split(/\s+/).length;
}

function parseFieldLine(line: string): { key: FieldName; value: string } | undefined {
  const match = line.match(/^\s*(?:[-*]\s*)?([^:]+):\s*(.*)$/);
  if (!match) return undefined;

  const rawKey = match[1]!.trim();
  const key = REQUIRED_FIELDS.find((field) => field === rawKey);
  if (!key) return undefined;

  return { key, value: stripWrapper(match[2] ?? "") };
}

function parseBoolean(value: string): boolean | undefined {
  const normalized = value.trim().toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  return undefined;
}

function isNoFindings(markdown: string): boolean {
  return /^## Findings\s*\r?\n\s*No findings\.\s*$/.test(markdown.trim());
}

function isWithinRoot(filePath: string, root: string): boolean {
  const relative = path.relative(root, filePath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function resolveReadableFile(
  filePath: string,
  allowedRoots: string[],
  label: string,
  errors: string[],
  baseDir: string
): string | undefined {
  const candidates = path.isAbsolute(filePath)
    ? [filePath]
    : [path.resolve(baseDir, filePath), path.resolve(process.cwd(), filePath)];
  const resolved = candidates.find((candidate) => existsSync(candidate));
  if (!resolved) {
    errors.push(`${label} not found: ${candidates.join(" or ")}`);
    return undefined;
  }

  let realPath: string;
  try {
    realPath = realpathSync(resolved);
  } catch (error) {
    errors.push(`${label} could not be resolved: ${resolved}`);
    return undefined;
  }

  if (!statSync(realPath).isFile()) {
    errors.push(`${label} is not a file: ${realPath}`);
    return undefined;
  }

  const allowedRealRoots = allowedRoots
    .filter((root) => existsSync(root))
    .map((root) => realpathSync(root));
  if (!allowedRealRoots.some((root) => isWithinRoot(realPath, root))) {
    errors.push(`${label} is outside allowed roots: ${realPath}`);
    return undefined;
  }

  return realPath;
}

function parseRawFindings(markdown: string, errors: string[]): RawFinding[] {
  const normalized = markdown.trim();
  const withoutOptionalHeading = normalized.replace(/^## Findings\s*\r?\n/, "").trim();
  const firstFindingIndex = withoutOptionalHeading.search(/^### Finding\s*$/m);

  if (firstFindingIndex === -1) {
    errors.push("No finding blocks found. Use `## Findings` followed by `No findings.` for an empty review.");
    return [];
  }

  if (withoutOptionalHeading.slice(0, firstFindingIndex).trim() !== "") {
    errors.push("Unsupported content found before the first finding block.");
  }

  const blocks = withoutOptionalHeading
    .slice(firstFindingIndex)
    .split(/(?=^### Finding\s*$)/m)
    .filter((block) => block.trim() !== "");

  return blocks.map((block, blockIndex) => {
    const fields = {} as RawFinding;
    const seen = new Set<FieldName>();
    let expectedFieldIndex = 0;

    for (const line of block.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (trimmed === "" || trimmed === "### Finding") continue;

      const parsed = parseFieldLine(line);
      if (!parsed) {
        const unknownField = trimmed.match(/^\s*(?:[-*]\s*)?([^:]+):/);
        if (unknownField) {
          errors.push(`Finding ${blockIndex + 1} has unsupported field: ${unknownField[1]!.trim()}`);
        } else if (trimmed.startsWith("#")) {
          errors.push(`Finding ${blockIndex + 1} has unsupported section: ${trimmed}`);
        } else {
          errors.push(`Finding ${blockIndex + 1} has unsupported content: ${trimmed}`);
        }
        continue;
      }

      if (seen.has(parsed.key)) {
        errors.push(`Finding ${blockIndex + 1} repeats field: ${parsed.key}`);
      }
      const actualFieldIndex = REQUIRED_FIELDS.indexOf(parsed.key);
      if (actualFieldIndex !== expectedFieldIndex) {
        errors.push(
          `Finding ${blockIndex + 1} field order mismatch: expected ${REQUIRED_FIELDS[expectedFieldIndex]}, found ${parsed.key}.`
        );
      }
      seen.add(parsed.key);
      fields[parsed.key] = parsed.value;
      expectedFieldIndex += 1;
    }

    for (const field of REQUIRED_FIELDS) {
      if (fields[field] === undefined) {
        errors.push(`Finding ${blockIndex + 1} is missing required field: ${field}`);
      }
    }

    return fields;
  });
}

function lineCount(content: string): number {
  return content.split(/\r?\n/).length;
}

function lineContainsEvidence(content: string, line: number, evidence: string): boolean {
  const lines = content.split(/\r?\n/);
  return (lines[line - 1] ?? "").includes(evidence);
}

function validateFinding(
  raw: RawFinding,
  index: number,
  warnings: Warning[],
  errors: string[],
  allowedRoots: string[],
  baseDir: string
): Finding | undefined {
  const sourceFileInput = raw["Source file"] || "";
  const rulePathInput = raw["Rule path"] || "";
  const lineRaw = raw.Line || "";
  const confidenceRaw = raw.Confidence || "";
  const evidenceQuote = raw["Evidence quote"] || "";
  const ruleQuote = raw["Rule quote"] || "";
  const contextSupportsViolationRaw = raw["Context supports violation"] || "";
  const flagReasoning = raw["Flag reasoning"] || "";

  let sourceContent = "";
  let ruleContent = "";

  const sourceFile = resolveReadableFile(
    sourceFileInput,
    allowedRoots,
    `Finding ${index + 1}: source file`,
    errors,
    baseDir
  );
  if (sourceFile) sourceContent = readFileSync(sourceFile, "utf8");

  const rulePath = resolveReadableFile(
    rulePathInput,
    allowedRoots,
    `Finding ${index + 1}: rule path`,
    errors,
    baseDir
  );
  if (rulePath) ruleContent = readFileSync(rulePath, "utf8");

  if (evidenceQuote.trim() === "") {
    errors.push(`Finding ${index + 1}: Evidence quote must not be empty.`);
  }

  if (ruleQuote.trim() === "") {
    errors.push(`Finding ${index + 1}: Rule quote must not be empty.`);
  }

  const line = Number(lineRaw);
  if (!Number.isInteger(line) || line <= 0) {
    errors.push(`Finding ${index + 1}: Line must be a positive integer.`);
  } else if (sourceContent && line > lineCount(sourceContent)) {
    errors.push(`Finding ${index + 1}: Line ${line} exceeds source line count.`);
  }

  const confidence = Number(confidenceRaw);
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    errors.push(`Finding ${index + 1}: Confidence must be a number between 0 and 1.`);
  }

  const contextSupportsViolation = parseBoolean(contextSupportsViolationRaw);
  if (contextSupportsViolation === undefined) {
    errors.push(`Finding ${index + 1}: Context supports violation must be true or false.`);
  }

  if (flagReasoning.trim() === "") {
    errors.push(`Finding ${index + 1}: Flag reasoning must not be empty.`);
  }

  if (sourceContent && evidenceQuote.trim() !== "" && !sourceContent.includes(evidenceQuote)) {
    errors.push(`Finding ${index + 1}: Evidence quote was not found in source file.`);
  }

  if (ruleContent && ruleQuote.trim() !== "" && !ruleContent.includes(ruleQuote)) {
    errors.push(`Finding ${index + 1}: Rule quote was not found in rule file.`);
  }

  if (
    sourceContent &&
    evidenceQuote.trim() !== "" &&
    sourceContent.includes(evidenceQuote) &&
    Number.isInteger(line) &&
    line > 0 &&
    line <= lineCount(sourceContent)
  ) {
    if (!lineContainsEvidence(sourceContent, line, evidenceQuote)) {
      warnings.push({
        type: "evidence_quote_line_mismatch",
        message: `Finding ${index + 1}: Evidence quote appears in the source file, but not on the reported line.`,
        findingIndexes: [index],
      });
    }
  }

  if (
    !sourceFile ||
    !rulePath ||
    !Number.isInteger(line) ||
    line <= 0 ||
    !Number.isFinite(confidence) ||
    confidence < 0 ||
    confidence > 1 ||
    contextSupportsViolation === undefined
  ) {
    return undefined;
  }

  return {
    index,
    rulePath,
    sourceFile,
    line,
    evidenceQuote,
    ruleQuote,
    flagReasoning,
    issue: raw.Issue || "",
    plausibleNonViolation: raw["Plausible non-violation"] || "",
    contextSupportsViolation,
    suggestion: raw.Suggestion || "",
    confidence,
  };
}

function addSameAnchorWarnings(findings: Finding[], warnings: Warning[]): void {
  const groups = new Map<string, number[]>();

  findings.forEach((finding, index) => {
    const key = [
      finding.sourceFile,
      finding.rulePath,
      normalizeAnchor(finding.evidenceQuote),
      normalizeAnchor(finding.ruleQuote),
      String(finding.line),
    ].join("\u0000");
    const group = groups.get(key) ?? [];
    group.push(index);
    groups.set(key, group);
  });

  for (const findingIndexes of groups.values()) {
    if (findingIndexes.length > 1) {
      warnings.push({
        type: "same_anchor_semantic_review_needed",
        message: "Multiple findings share source/rule/evidence anchors; main agent must review semantic overlap.",
        findingIndexes,
      });
    }
  }
}

function computeWordCount(findings: Finding[]): number {
  const sourceFiles = new Set(findings.map((finding) => finding.sourceFile));
  let total = 0;
  for (const sourceFile of sourceFiles) {
    total += countWords(readFileSync(sourceFile, "utf8"));
  }
  return total;
}

function computeScore(findingCount: number, wordCount: number): number {
  const wordCountForScore = wordCount || 1;
  const density = (findingCount / wordCountForScore) * 100;
  const rawScore = Math.max(0, Math.min(100, 100 - density * 10));
  return Number((rawScore / 10).toFixed(1));
}

function main(): void {
  const reviewPath = process.argv[2];
  const errors: string[] = [];
  const warnings: Warning[] = [];

  if (!reviewPath) {
    errors.push("Usage: parse-review-and-score.ts <review.md>");
    const output: Output = { valid: false, findingCount: 0, wordCount: 0, score: 0, findings: [], warnings, errors };
    console.log(JSON.stringify(output, null, 2));
    process.exitCode = 1;
    return;
  }

  const resolvedReviewPath = path.resolve(reviewPath);
  if (!existsSync(resolvedReviewPath)) {
    errors.push(`Review file not found: ${resolvedReviewPath}`);
    const output: Output = { valid: false, findingCount: 0, wordCount: 0, score: 0, findings: [], warnings, errors };
    console.log(JSON.stringify(output, null, 2));
    process.exitCode = 1;
    return;
  }

  const reviewDir = path.dirname(realpathSync(resolvedReviewPath));
  const skillRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
  const allowedRoots = [process.cwd(), reviewDir, path.dirname(reviewDir), skillRoot];

  const markdown = readFileSync(resolvedReviewPath, "utf8");
  if (isNoFindings(markdown)) {
    const output: Output = { valid: true, findingCount: 0, wordCount: 0, score: 10, findings: [], warnings, errors };
    console.log(JSON.stringify(output, null, 2));
    return;
  }

  const rawFindings = parseRawFindings(markdown, errors);
  const findings = rawFindings
    .map((raw, index) => validateFinding(raw, index, warnings, errors, allowedRoots, reviewDir))
    .filter((finding): finding is Finding => finding !== undefined);

  addSameAnchorWarnings(findings, warnings);

  const wordCount = computeWordCount(findings);
  const findingCount = rawFindings.length;
  const output: Output = {
    valid: errors.length === 0,
    findingCount,
    wordCount,
    score: computeScore(findingCount, wordCount),
    findings,
    warnings,
    errors,
  };

  console.log(JSON.stringify(output, null, 2));
  process.exitCode = output.valid ? 0 : 1;
}

main();
