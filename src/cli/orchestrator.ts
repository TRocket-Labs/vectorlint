import { readFileSync } from 'fs';
import { randomUUID } from 'crypto';
import * as path from 'path';
import type { PromptFile } from '../prompts/prompt-loader';
import { ScanPathResolver } from '../boundaries/scan-path-resolver';
import { ValeJsonFormatter, type JsonIssue } from '../output/vale-json-formatter';
import { JsonFormatter, type Issue, type ScoreComponent } from '../output/json-formatter';
import { RdJsonFormatter } from '../output/rdjson-formatter';
import { printFileHeader, printIssueRow, printEvaluationSummaries, printAgentFinding, type EvaluationSummary } from '../output/reporter';
import { ProgressReporter } from '../output/progress-reporter';
import { checkTarget } from '../prompts/target';
import { isJudgeResult } from '../prompts/schema';
import { handleUnknownError, MissingDependencyError } from '../errors/index';
import { createEvaluator } from '../evaluators/index';
import { Type, Severity } from '../evaluators/types';
import { USER_INSTRUCTION_FILENAME } from '../config/constants';
import { OutputFormat } from './types';
import { AGENT_EVALUATION_MODE } from './mode';
import type {
  EvaluationOptions, EvaluationResult, ErrorTrackingResult,
  ReportIssueParams, ProcessViolationsParams,
  ProcessCriterionParams, ProcessCriterionResult, ValidationParams, ProcessPromptResultParams,
  RunPromptEvaluationParams, RunPromptEvaluationResult, EvaluateFileParams, EvaluateFileResult,
  RunPromptEvaluationResultSuccess
} from './types';
import {
  calculateCost,
  TokenUsageStats
} from '../providers/token-usage';
import { calculateCheckScore } from '../scoring';
import { countWords } from '../chunking';
import { locateQuotedText } from "../output/location";
import {
  computeFilterDecision,
  type FilterDecision,
} from "../evaluators/violation-filter";
import { writeDebugRunArtifact } from "../debug/run-artifact";
import {
  runAgentExecutor,
  collectAgentFindings,
  createReadFileTool,
  createSearchContentTool,
  createSearchFilesTool,
  createListDirectoryTool,
  createLintTool,
  type AgentFinding,
} from '../agent/index';

const LINT_PROGRESS_TEXT = '[vectorlint] linting....';
const AGENT_PROGRESS_TEXT = '[vectorlint] reviewing.....';
const PROGRESS_DONE_TEXT = '[vectorlint] done.';
const AGENT_TOOL_CONCURRENCY = 1;

function getModelInfoFromEnv(): { provider?: string; name?: string; tag?: string } {
  const provider = process.env.LLM_PROVIDER;
  let name: string | undefined;

  switch (provider) {
    case "openai":
      name = process.env.OPENAI_MODEL;
      break;
    case "anthropic":
      name = process.env.ANTHROPIC_MODEL;
      break;
    case "azure-openai":
      name = process.env.AZURE_OPENAI_DEPLOYMENT_NAME;
      break;
    case "gemini":
      name = process.env.GEMINI_MODEL;
      break;
  }

  const tag = [provider, name].filter(Boolean).join("-");
  return { ...(provider && { provider }), ...(name && { name }), ...(tag && { tag }) };
}


/*
 * Returns the evaluator type, defaulting to 'base' if not specified.
 */
function resolveEvaluatorType(evaluator: string | undefined): string {
  return evaluator || Type.BASE;
}

/*
 * Constructs a hierarchical rule name following the pattern:
 * - With criterion: PackName.RuleId.CriterionId
 * - Without criterion: PackName.RuleId
 */
function buildRuleName(
  packName: string,
  ruleId: string,
  criterionId: string | undefined
): string {
  const parts = [packName, ruleId];
  if (criterionId) {
    parts.push(criterionId);
  }
  return parts.join('.');
}

/*
 * Generic concurrency runner that executes workers in parallel up to a specified limit.
 * Preserves result order matching input order.
 */
async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array<R>(items.length);
  let i = 0;
  const workers = new Array(Math.min(limit, items.length))
    .fill(0)
    .map(async () => {
      while (true) {
        const idx = i++;
        if (idx >= items.length) break;
        const item = items[idx];
        if (item !== undefined) {
          results[idx] = await worker(item, idx);
        }
      }
    });
  await Promise.all(workers);
  return results;
}

function buildDiffContext(files: string[], cwd: string): string {
  if (files.length === 0) return '';
  const fileList = files.map((file) => `- ${toRepoRelativePath(file, cwd)}`).join('\n');
  return `Changed files:\n${fileList}`;
}

function toRepoRelativePath(filePath: string, cwd: string): string {
  if (!path.isAbsolute(filePath)) return filePath;
  return path.relative(cwd, filePath) || filePath;
}

function getPromptKey(prompt: PromptFile): string {
  return prompt.meta.id || prompt.filename;
}

function isPromptActiveForResolution(
  prompt: PromptFile,
  resolution: { packs: string[]; overrides: Record<string, unknown> },
): boolean {
  if (prompt.pack === '') return true;
  if (!prompt.pack || !resolution.packs.includes(prompt.pack)) return false;
  if (!prompt.meta?.id) return true;
  const disableKey = `${prompt.pack}.${prompt.meta.id}`;
  const overrideValue = resolution.overrides[disableKey];
  return (
    typeof overrideValue !== 'string' ||
    overrideValue.toLowerCase() !== 'disabled'
  );
}

function buildMatchedFilesByRule(
  targets: string[],
  prompts: PromptFile[],
  scanPaths: EvaluationOptions['scanPaths'],
  cwd: string,
): Map<string, string[]> {
  const relTargets = targets.map((file) => toRepoRelativePath(file, cwd));
  const matchedByRule = new Map<string, Set<string>>();

  for (const prompt of prompts) {
    matchedByRule.set(getPromptKey(prompt), new Set<string>());
  }

  if (scanPaths && scanPaths.length > 0) {
    const resolver = new ScanPathResolver();
    const availablePacks = Array.from(
      new Set(prompts.map((prompt) => prompt.pack).filter((pack): pack is string => !!pack))
    );

    for (const relFile of relTargets) {
      let resolution: { packs: string[]; overrides: Record<string, unknown> };
      try {
        resolution = resolver.resolveConfiguration(relFile, scanPaths, availablePacks);
      } catch {
        // Keep behavior aligned with lint mode expectations: unmatched files run no packed rules.
        resolution = { packs: [], overrides: {} };
      }

      for (const prompt of prompts) {
        if (!isPromptActiveForResolution(prompt, resolution)) continue;
        matchedByRule.get(getPromptKey(prompt))?.add(relFile);
      }
    }
  } else {
    for (const prompt of prompts) {
      const bucket = matchedByRule.get(getPromptKey(prompt));
      if (!bucket) continue;
      for (const relFile of relTargets) {
        bucket.add(relFile);
      }
    }
  }

  const normalized = new Map<string, string[]>();
  for (const [ruleKey, files] of matchedByRule.entries()) {
    normalized.set(ruleKey, Array.from(files));
  }
  return normalized;
}

function resolveAgentFindingSeverity(
  finding: AgentFinding,
  rulesById: Map<string, PromptFile>,
): Severity {
  if (finding.kind === 'top-level') {
    return Severity.WARNING;
  }

  const matchedRule = rulesById.get(finding.ruleId);
  return matchedRule?.meta.severity === Severity.WARNING
    ? Severity.WARNING
    : Severity.ERROR;
}

type AgentRuleScore = {
  ruleId: string;
  score: number;
  scoreText: string;
};

function isPathWithinCwd(filePath: string, cwd: string): boolean {
  const relative = path.relative(cwd, filePath);
  return !relative.startsWith('..') && !path.isAbsolute(relative);
}

function getFileWordCount(
  file: string,
  cwd: string,
  cache: Map<string, number>,
): number {
  const repoRelative = toRepoRelativePath(file, cwd);
  if (cache.has(repoRelative)) {
    return cache.get(repoRelative)!;
  }

  const absolute = path.isAbsolute(file) ? file : path.resolve(cwd, repoRelative);
  if (!isPathWithinCwd(absolute, cwd)) {
    cache.set(repoRelative, 1);
    return 1;
  }

  try {
    const content = readFileSync(absolute, 'utf-8');
    const words = Math.max(1, countWords(content) || 1);
    cache.set(repoRelative, words);
    return words;
  } catch {
    cache.set(repoRelative, 1);
    return 1;
  }
}

function buildAgentRuleScores(
  findings: AgentFinding[],
  rules: PromptFile[],
  cwd: string,
): AgentRuleScore[] {
  const fileWordCountCache = new Map<string, number>();
  const inlineCountsByRule = new Map<string, Map<string, number>>();

  for (const finding of findings) {
    if (finding.kind !== 'inline') continue;
    const fileCounts = inlineCountsByRule.get(finding.ruleId) ?? new Map<string, number>();
    const repoRelativeFile = toRepoRelativePath(finding.file, cwd);
    fileCounts.set(repoRelativeFile, (fileCounts.get(repoRelativeFile) ?? 0) + 1);
    inlineCountsByRule.set(finding.ruleId, fileCounts);
  }

  return rules.map((rule) => {
    const ruleId = rule.meta.id;
    const fileCounts = inlineCountsByRule.get(ruleId);
    if (!fileCounts || fileCounts.size === 0) {
      return {
        ruleId,
        score: 10,
        scoreText: '10.0/10',
      };
    }

    let totalInlineFindings = 0;
    let totalWords = 0;
    for (const [file, count] of fileCounts.entries()) {
      totalInlineFindings += count;
      totalWords += getFileWordCount(file, cwd, fileWordCountCache);
    }

    const syntheticViolations = Array.from({ length: totalInlineFindings }, (_, index) => ({
      line: index + 1,
      description: 'Agent finding',
      analysis: 'Agent finding',
    }));

    const scored = calculateCheckScore(
      syntheticViolations,
      Math.max(1, totalWords),
      {
        strictness: rule.meta.strictness,
        promptSeverity: rule.meta.severity,
      },
    );

    return {
      ruleId,
      score: scored.final_score,
      scoreText: `${scored.final_score.toFixed(1)}/10`,
    };
  });
}

function createAgentRdJsonIssue(
  line: number,
  finding: AgentFinding,
  severity: Severity,
): Issue {
  return {
    line,
    column: 1,
    span: [1, 1],
    severity,
    message: finding.message,
    rule: finding.ruleId,
    match: '',
    source: 'agent',
    ...(finding.suggestion ? { suggestion: finding.suggestion } : {}),
  };
}

function addAgentFindingsToRdJson(
  formatter: RdJsonFormatter,
  findings: AgentFinding[],
  rulesById: Map<string, PromptFile>,
  cwd: string,
  fallbackFile: string,
): void {
  for (const finding of findings) {
    const severity = resolveAgentFindingSeverity(finding, rulesById);
    if (finding.kind === 'inline') {
      const issueFile = toRepoRelativePath(finding.file, cwd);
      formatter.addIssue(
        issueFile,
        createAgentRdJsonIssue(finding.startLine, finding, severity),
      );
      continue;
    }

    const references = finding.references ?? [];
    if (references.length === 0) {
      formatter.addIssue(
        fallbackFile,
        createAgentRdJsonIssue(1, finding, severity),
      );
      continue;
    }

    for (const reference of references) {
      const issueFile = toRepoRelativePath(reference.file, cwd);
      formatter.addIssue(
        issueFile,
        createAgentRdJsonIssue(reference.startLine ?? 1, finding, severity),
      );
    }
  }
}

async function runAgentMode(
  targets: string[],
  options: EvaluationOptions
): Promise<EvaluationResult> {
  const { prompts, provider, scanPaths, outputFormat = OutputFormat.Line, userInstructionContent } = options;
  const cwd = process.cwd();

  const sharedTools = {
    read_file: createReadFileTool(cwd),
    search_content: createSearchContentTool(cwd),
    search_files: createSearchFilesTool(cwd),
    list_directory: createListDirectoryTool(cwd),
  };

  const model = provider.getLanguageModel();
  const diffContext = buildDiffContext(targets, cwd);
  const matchedFilesByRule = buildMatchedFilesByRule(targets, prompts, scanPaths, cwd);
  const promptsToRun = prompts.filter(
    (rule) => (matchedFilesByRule.get(getPromptKey(rule)) ?? []).length > 0
  );
  const progress = outputFormat === OutputFormat.Line
    ? new ProgressReporter({
      runningText: AGENT_PROGRESS_TEXT,
      doneText: PROGRESS_DONE_TEXT,
    })
    : undefined;
  progress?.start();
  const rulesById = new Map(prompts.map((prompt) => [prompt.meta.id, prompt]));

  const agentResults = await (async () => {
    const results = [] as Array<Awaited<ReturnType<typeof runAgentExecutor>>>;
    try {
      for (let index = 0; index < promptsToRun.length; index += 1) {
        const rule = promptsToRun[index];
        if (!rule) continue;
        const ruleLabel = rule.meta.id || rule.filename || `rule-${index + 1}`;
        progress?.setRunningText(
          `${AGENT_PROGRESS_TEXT} ${ruleLabel} (${index + 1}/${promptsToRun.length})`,
        );

        const result = await runAgentExecutor({
          rule,
          matchedFiles: matchedFilesByRule.get(getPromptKey(rule)) ?? [],
          cwd,
          model,
          tools: {
            ...sharedTools,
            lint: createLintTool(cwd, rule, provider),
          },
          diffContext,
          maxParallelToolCalls: AGENT_TOOL_CONCURRENCY,
          ...(options.agentMaxRetries !== undefined ? { maxRetries: options.agentMaxRetries } : {}),
          onStatus: ({ type, toolName, stepNumber }) => {
            const suffix =
              type === 'tool-start' && toolName
                ? `tool:${toolName}`
                : type === 'tool-finish' && toolName
                  ? `done:${toolName}`
                  : `step:${stepNumber + 1}`;
            progress?.setRunningText(`${AGENT_PROGRESS_TEXT} ${ruleLabel} ${suffix}`);
          },
          ...(userInstructionContent ? { userInstructions: userInstructionContent } : {}),
        });
        results.push(result);
      }

      return results;
    } finally {
      progress?.stop();
    }
  })();

  const findings = collectAgentFindings(agentResults);
  const requestFailures = agentResults.filter((result) => result.error).length;
  const hadOperationalErrors = requestFailures > 0;
  const ruleScores = buildAgentRuleScores(findings, promptsToRun, cwd);
  const scoreSummary = new Map<string, EvaluationSummary[]>(
    ruleScores.map((entry) => [
      entry.ruleId,
      [{ id: 'overall', scoreText: entry.scoreText, score: entry.score }],
    ]),
  );
  const findingsWithSeverity = findings.map((finding) => ({
    finding,
    severity: resolveAgentFindingSeverity(finding, rulesById),
  }));
  const errorCount = findingsWithSeverity.filter((entry) => entry.severity === Severity.ERROR).length;
  const warningCount = findingsWithSeverity.length - errorCount;
  const rdJsonFallbackFile = toRepoRelativePath(targets[0] || 'unknown', cwd);
  const jsonPayload = {
    findings,
    summary: {
      files: targets.length,
      errors: errorCount,
      warnings: warningCount,
      requestFailures,
    },
    scores: ruleScores,
    metadata: {
      mode: AGENT_EVALUATION_MODE,
      timestamp: new Date().toISOString(),
    },
  };

  if (outputFormat === OutputFormat.Line) {
    if (hadOperationalErrors) {
      console.warn(`[vectorlint] Agent mode encountered ${requestFailures} request failure${requestFailures === 1 ? '' : 's'}.`);
      for (const result of agentResults) {
        if (result.error) {
          console.warn(`[vectorlint] ${result.ruleId}: ${result.error}`);
        }
      }
    }

    if (findings.length === 0) {
      console.log('[vectorlint] No agent findings.');
    } else {
      for (const { finding, severity } of findingsWithSeverity) {
        printAgentFinding(finding, severity);
      }
    }
    printEvaluationSummaries(scoreSummary);
  } else if (outputFormat === OutputFormat.Json) {
    console.log(JSON.stringify(jsonPayload, null, 2));
  } else if (outputFormat === OutputFormat.RdJson) {
    const formatter = new RdJsonFormatter();
    addAgentFindingsToRdJson(formatter, findings, rulesById, cwd, rdJsonFallbackFile);
    console.log(formatter.toJson());
  } else if (outputFormat === OutputFormat.ValeJson) {
    console.warn('[vectorlint] vale-json is not supported in agent mode. Falling back to --output json.');
    console.log(JSON.stringify(jsonPayload, null, 2));
  }

  return {
    totalFiles: targets.length,
    totalErrors: errorCount,
    totalWarnings: warningCount,
    requestFailures,
    hadOperationalErrors,
    hadSeverityErrors: errorCount > 0,
  };
}

/*
 * Reports an issue in either line or JSON format.
 */
function reportIssue(params: ReportIssueParams): void {
  const {
    file,
    line,
    column,
    severity,
    summary,
    ruleName,
    outputFormat,
    jsonFormatter,
    analysis,
    suggestion,
    fix,
    scoreText,
    match,
  } = params;

  if (outputFormat === OutputFormat.Line) {
    const locStr = `${line}:${column}`;
    printIssueRow(
      locStr,
      severity,
      summary,
      ruleName,
      suggestion ? { suggestion } : {}
    );
  } else if (outputFormat === OutputFormat.ValeJson) {
    const issue: JsonIssue = {
      file,
      line,
      column,
      severity,
      message: summary,
      rule: ruleName,
      match: match || "",
      matchLength: match ? match.length : 0,
      ...(suggestion !== undefined ? { suggestion } : {}),
      ...(fix !== undefined ? { fix } : {}),
      ...(scoreText !== undefined ? { score: scoreText } : {}),
    };
    (jsonFormatter as ValeJsonFormatter).addIssue(issue);
  } else if (
    outputFormat === OutputFormat.Json ||
    outputFormat === OutputFormat.RdJson
  ) {
    const matchLen = match ? match.length : 0;
    const endColumn = column + matchLen;
    const issue: Issue = {
      line,
      column,
      span: [column, endColumn],
      severity,
      message: summary,
      rule: ruleName,
      match: match || "",
      ...(analysis ? { analysis } : {}),
      ...(suggestion ? { suggestion } : {}),
      ...(fix ? { fix } : {}),
    };
    (jsonFormatter as JsonFormatter | RdJsonFormatter).addIssue(file, issue);
  }
}

/*
 * Locates and reports each violation using pre/post evidence markers.
 * If location matching fails (missing markers, content mismatch), logs warning
 * and continues processing. Returns hadOperationalErrors=true if any violations
 * couldn't be located, signaling text matching issues vs. content quality issues.
 */
function locateAndReportViolations(params: ProcessViolationsParams): {
  hadOperationalErrors: boolean;
} {
  const {
    violations,
    content,
    relFile,
    severity,
    ruleName,
    scoreText,
    outputFormat,
    jsonFormatter,
    verbose,
  } = params;

  let hadOperationalErrors = false;

  // Locate all violations and filter out those that can't be verified
  // Then de-duplicate by (quoted_text, line)
  const seen = new Set<string>();
  const verifiedViolations: Array<{
    v: (typeof violations)[0];
    line: number;
    column: number;
    matchedText: string;
    rowSummary: string;
  }> = [];

  for (const v of violations) {
    if (!v) continue;

    const rowSummary = (v.message || "").trim();

    try {
      const locWithMatch = locateQuotedText(
        content,
        {
          quoted_text: v.quoted_text || "",
          context_before: v.context_before || "",
          context_after: v.context_after || "",
        },
        80,
        v.line
      );

      if (!locWithMatch) {
        // Can't verify this quote exists - skip it entirely
        if (verbose) {
          console.warn(
            `[vectorlint] Skipping unverifiable quote: "${v.quoted_text}"`
          );
        }
        hadOperationalErrors = true;
        continue;
      }

      const line = locWithMatch.line;
      const column = locWithMatch.column;
      const matchedText = locWithMatch.match || "";

      // De-duplicate by (quoted_text, line) - skip if quoted_text is empty
      const dedupeKey = v.quoted_text ? `${v.quoted_text}:${line}` : null;
      if (dedupeKey && seen.has(dedupeKey)) {
        continue; // Skip duplicate
      }
      if (dedupeKey) {
        seen.add(dedupeKey);
      }

      verifiedViolations.push({ v, line, column, matchedText, rowSummary });
    } catch (e: unknown) {
      const err = handleUnknownError(e, "Locating evidence");
      if (verbose) {
        console.warn(`[vectorlint] Error locating evidence: ${err.message}`);
      }
      hadOperationalErrors = true;
    }
  }

  // Report only verified, unique violations
  for (const {
    v,
    line,
    column,
    matchedText,
    rowSummary,
  } of verifiedViolations) {
    reportIssue({
      file: relFile,
      line,
      column,
      severity,
      summary: rowSummary,
      ruleName,
      outputFormat,
      jsonFormatter,
      ...(v.analysis !== undefined && { analysis: v.analysis }),
      ...(v.suggestion !== undefined && { suggestion: v.suggestion }),
      ...(v.fix !== undefined && { fix: v.fix }),
      scoreText,
      match: matchedText,
    });
  }

  return { hadOperationalErrors };
}

function getViolationFilterResults<
  TViolation extends Parameters<typeof computeFilterDecision>[0]
>(
  violations: TViolation[]
): {
  decisions: FilterDecision[];
  surfacedViolations: TViolation[];
} {
  const decisions = violations.map((v) => computeFilterDecision(v));
  const surfacedViolations = violations.filter(
    (_v, i) => decisions[i]?.surface === true
  );

  return { decisions, surfacedViolations };
}

/*
 * Extracts pre-calculated scores from a subjective evaluation criterion and reports surfaced violations.
 * Violations that do not pass computeFilterDecision are not reported.
 * Returns error/warning counts, score entry for Quality Scores, and score components for JSON.
 */
function extractAndReportCriterion(
  params: ProcessCriterionParams
): ProcessCriterionResult {
  const {
    exp,
    result,
    content,
    relFile,
    packName,
    promptId,
    meta,
    outputFormat,
    jsonFormatter,
    verbose,
  } = params;
  let hadOperationalErrors = false;
  let hadSeverityErrors = false;

  const nameKey = String(exp.name || exp.id || "");
  const criterionId = exp.id
    ? String(exp.id)
    : exp.name
      ? String(exp.name)
        .replace(/[^A-Za-z0-9]+/g, " ")
        .split(" ")
        .filter(Boolean)
        .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
        .join("")
      : "";
  const ruleName = buildRuleName(packName, promptId, criterionId);

  const weightNum = exp.weight || 1;
  const maxScore = weightNum;

  // Target gating (deterministic precheck)
  const metaTargetSpec = meta.target;
  const expTargetSpec = exp.target;
  const targetCheck = checkTarget(content, metaTargetSpec, expTargetSpec);
  const missingTarget = targetCheck.missing;

  if (missingTarget) {
    hadSeverityErrors = true;
    const summary = "target not found";
    const suggestion =
      targetCheck.suggestion ||
      expTargetSpec?.suggestion ||
      metaTargetSpec?.suggestion ||
      "Add the required target section.";
    reportIssue({
      file: relFile,
      line: 1,
      column: 1,
      severity: Severity.ERROR,
      summary,
      ruleName,
      outputFormat,
      jsonFormatter,
      suggestion,
      scoreText: "nil",
      match: "",
    });
    return {
      errors: 1,
      warnings: 0,
      userScore: 0,
      maxScore,
      hadOperationalErrors,
      hadSeverityErrors,
      scoreEntry: { id: ruleName, scoreText: "0.0/10", score: 0.0 },
      scoreComponent: {
        criterion: nameKey,
        rawScore: 0,
        maxScore: 4,
        weightedScore: 0,
        weightedMaxScore: weightNum,
        normalizedScore: 0,
        normalizedMaxScore: 10,
      },
    };
  }

  const got = result.criteria.find(
    (c) => c.name === nameKey || c.name.toLowerCase() === nameKey.toLowerCase()
  );
  if (!got) {
    return {
      errors: 0,
      warnings: 0,
      userScore: 0,
      maxScore,
      hadOperationalErrors,
      hadSeverityErrors,
      scoreEntry: { id: ruleName, scoreText: "-", score: 0.0 },
      scoreComponent: {
        criterion: nameKey,
        rawScore: 0,
        maxScore: 4,
        weightedScore: 0,
        weightedMaxScore: weightNum,
        normalizedScore: 0,
        normalizedMaxScore: 10,
      },
    };
  }

  const score = Number(got.score);

  // Use pre-calculated values from evaluator
  const rawWeighted = got.weighted_points;
  const normalizedScore = got.normalized_score;
  const userScore = rawWeighted;
  const violations = got.violations;
  const { surfacedViolations } = getViolationFilterResults(violations);

  // Display normalized score (1-10) in CLI output
  const scoreText = `${normalizedScore.toFixed(1)}/10`;

  // Determine severity based on violations
  // If there are violations, use evaluator's scoring to determine severity
  // Score <= 1 = error, score = 2 = warning, score > 2 = no severity needed (but we still create scoreEntry)
  let errors = 0;
  let warnings = 0;
  let severity: Severity | undefined;

  if (surfacedViolations.length > 0) {
    // Determine severity from score for violations
    if (score <= 1) {
      severity = Severity.ERROR;
      hadSeverityErrors = true;
      errors = surfacedViolations.length;
    } else if (score === 2) {
      severity = Severity.WARNING;
      warnings = surfacedViolations.length;
    } else {
      // Score > 2 but has violations - this is informational
      // Use WARNING as default for informational violations
      severity = Severity.WARNING;
      warnings = surfacedViolations.length;
    }

    // Report surfaced violations only
    const violationResult = locateAndReportViolations({
      violations: surfacedViolations as Array<{
        line?: number;
        quoted_text?: string;
        context_before?: string;
        context_after?: string;
        analysis?: string;
        suggestion?: string;
      }>,
      content,
      relFile,
      severity,
      ruleName,
      scoreText,
      outputFormat,
      jsonFormatter,
      verbose: !!verbose,
    });
    hadOperationalErrors =
      hadOperationalErrors || violationResult.hadOperationalErrors;
  } else if (score <= 2) {
    // No violations but low score - report with summary
    severity = score <= 1 ? Severity.ERROR : Severity.WARNING;
    if (severity === Severity.ERROR) {
      hadSeverityErrors = true;
      errors = 1;
    } else {
      warnings = 1;
    }

    const sum = got.summary.trim();
    const words = sum.split(/\s+/).filter(Boolean);
    const limited = words.slice(0, 15).join(" ");
    const summaryText = limited || "No findings";
    reportIssue({
      file: relFile,
      line: 1,
      column: 1,
      severity,
      summary: summaryText,
      ruleName,
      outputFormat,
      jsonFormatter,
      scoreText,
      match: "",
    });
  }

  return {
    errors,
    warnings,
    userScore,
    maxScore,
    hadOperationalErrors,
    hadSeverityErrors,
    scoreEntry: { id: ruleName, scoreText, score: normalizedScore },
    scoreComponent: {
      criterion: nameKey,
      rawScore: score,
      maxScore: 4,
      weightedScore: rawWeighted,
      weightedMaxScore: weightNum,
      normalizedScore: normalizedScore,
      normalizedMaxScore: 10,
    },
  };
}

/*
 * Validates that all expected criteria are present in the result.
 */
function validateCriteriaCompleteness(params: ValidationParams): boolean {
  const { meta, result } = params;
  let hadErrors = false;

  const expectedNames = new Set<string>(
    (meta.criteria || []).map((c) => String(c.name || c.id || ""))
  );
  const returnedNames = new Set(
    result.criteria.map((c: { name: string }) => c.name)
  );

  // Create normalized maps for case-insensitive lookup
  const expectedNormalized = new Set<string>();
  const expectedOriginalMap = new Map<string, string>();
  for (const name of expectedNames) {
    const norm = name.toLowerCase();
    expectedNormalized.add(norm);
    expectedOriginalMap.set(norm, name);
  }

  const returnedNormalized = new Set<string>();
  for (const name of returnedNames) {
    returnedNormalized.add(name.toLowerCase());
  }

  for (const norm of expectedNormalized) {
    if (!returnedNormalized.has(norm)) {
      console.error(
        `Missing criterion in model output: ${expectedOriginalMap.get(norm)}`
      );
      hadErrors = true;
    }
  }

  for (const name of returnedNames) {
    if (!expectedNormalized.has(name.toLowerCase())) {
      console.warn(
        `[vectorlint] Extra criterion returned by model (ignored): ${name}`
      );
    }
  }

  return hadErrors;
}

/*
 * Validates that all criterion scores are within valid range.
 */
function validateScores(params: ValidationParams): boolean {
  const { meta, result } = params;
  let hadErrors = false;

  for (const exp of meta.criteria || []) {
    const nameKey = String(exp.name || exp.id || "");
    const got = result.criteria.find(
      (c) =>
        c.name === nameKey || c.name.toLowerCase() === nameKey.toLowerCase()
    );
    if (!got) continue;

    const score = Number(got.score);
    if (!Number.isFinite(score) || score < 0 || score > 4) {
      console.error(`Invalid score for ${nameKey}: ${score}`);
      hadErrors = true;
    }
  }

  return hadErrors;
}

/*
 * Routes evaluation results through check or judge processing paths.
 * Check: Reports violations, creates scoreEntry using final_score.
 * Judge: Iterates through criteria, validates scores, creates scoreEntry per criterion.
 * Both paths generate scoreEntries for Quality Scores display.
 */
function routePromptResult(
  params: ProcessPromptResultParams
): ErrorTrackingResult {
  const {
    promptFile,
    result,
    content,
    relFile,
    outputFormat,
    jsonFormatter,
    verbose,
    debugJson,
  } = params;
  const meta = promptFile.meta;
  const promptId = (meta.id || "").toString();

  let hadOperationalErrors = false;
  let hadSeverityErrors = false;
  let promptErrors = 0;
  let promptWarnings = 0;

  // Handle Check Result
  if (!isJudgeResult(result)) {
    const { decisions, surfacedViolations } = getViolationFilterResults(
      result.violations
    );

    // Score calculated from surfaced violations only — matches what user sees
    const scored = calculateCheckScore(
      surfacedViolations,
      result.word_count,
      {
        strictness: promptFile.meta.strictness,
        promptSeverity: promptFile.meta.severity,
      }
    );
    const severity = scored.severity;
    // Group violations by criterionName
    const violationsByCriterion = new Map<
      string | undefined,
      typeof surfacedViolations
    >();
    for (const v of surfacedViolations) {
      const criterionName = v.criterionName;
      if (!violationsByCriterion.has(criterionName)) {
        violationsByCriterion.set(criterionName, []);
      }
      violationsByCriterion.get(criterionName)!.push(v);
    }

    // Report violations grouped by criterion
    let totalErrors = 0;
    let totalWarnings = 0;

    for (const [criterionName, violations] of violationsByCriterion) {
      // Find criterion ID from meta
      let criterionId: string | undefined;
      if (criterionName && meta.criteria) {
        const criterion = meta.criteria.find(c => c.name === criterionName);
        criterionId = criterion?.id;
      }

      const ruleName = buildRuleName(promptFile.pack, promptId, criterionId);

      if (violations.length > 0) {
        const violationResult = locateAndReportViolations({
          violations,
          content,
          relFile,
          severity,
          ruleName,
          scoreText: '',
          outputFormat,
          jsonFormatter,
          verbose: !!verbose,
        });
        hadOperationalErrors = hadOperationalErrors || violationResult.hadOperationalErrors;

        if (severity === Severity.ERROR) {
          totalErrors += violations.length;
        } else {
          totalWarnings += violations.length;
        }
      }
    }

    // Create scoreEntry for Quality Scores display
    const scoreEntry: EvaluationSummary = {
      id: buildRuleName(promptFile.pack, promptId, undefined),
      scoreText: `${scored.final_score.toFixed(1)}/10`,
      score: scored.final_score,
    };

    if (debugJson) {
      const runId = randomUUID();
      const model = getModelInfoFromEnv();

      try {
        const filePath = writeDebugRunArtifact(process.cwd(), runId, {
          file: relFile,
          ...(Object.keys(model).length > 0 ? { model } : {}),
          ...(model.tag !== undefined ? { subdir: model.tag } : {}),
          prompt: {
            pack: promptFile.pack,
            id: promptId,
            filename: promptFile.filename,
            evaluation_type: "check",
          },
          raw_model_output: (result as { raw_model_output?: unknown }).raw_model_output ?? null,
          filter_decisions: decisions.map((d, i) => ({
            index: i,
            surface: d.surface,
            reasons: d.reasons,
          })),
          surfaced_violations: surfacedViolations,
        });
        console.warn(`[vectorlint] Debug JSON written: ${filePath}`);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.warn(`[vectorlint] Debug JSON write failed: ${message}`);
      }
    }

    return {
      errors: totalErrors,
      warnings: totalWarnings,
      hadOperationalErrors,
      hadSeverityErrors: severity === Severity.ERROR && totalErrors > 0,
      scoreEntries: [scoreEntry],
    };
  }

  // Handle Judge Result
  // Validate criterion completeness and scores
  hadOperationalErrors =
    validateCriteriaCompleteness({ meta, result }) || hadOperationalErrors;
  hadOperationalErrors =
    validateScores({ meta, result }) || hadOperationalErrors;

  // Reset promptErrors and promptWarnings for subjective results
  promptErrors = 0;
  promptWarnings = 0;
  const criterionScores: EvaluationSummary[] = [];
  const scoreComponents: ScoreComponent[] = [];

  // Iterate through each criterion
  for (const exp of meta.criteria || []) {
    const criterionResult = extractAndReportCriterion({
      exp,
      result,
      content,
      relFile,
      packName: promptFile.pack,
      promptId,
      promptFilename: promptFile.filename,
      meta,
      outputFormat,
      jsonFormatter,
      verbose: !!verbose,
    });

    promptErrors += criterionResult.errors;
    promptWarnings += criterionResult.warnings;
    hadOperationalErrors =
      hadOperationalErrors || criterionResult.hadOperationalErrors;
    hadSeverityErrors = hadSeverityErrors || criterionResult.hadSeverityErrors;
    criterionScores.push(criterionResult.scoreEntry);

    if (criterionResult.scoreComponent) {
      scoreComponents.push(criterionResult.scoreComponent);
    }
  }

  if (outputFormat === OutputFormat.Json && scoreComponents.length > 0) {
    (jsonFormatter as JsonFormatter | RdJsonFormatter).addEvaluationScore(
      relFile,
      {
        id: promptId || promptFile.filename.replace(/\.md$/, ""),
        scores: scoreComponents,
      }
    );
  }

  if (debugJson) {
    const runId = randomUUID();
    const flat = result.criteria.flatMap((c) =>
      (c.violations || []).map((v, i) => ({
        criterion: c.name,
        index: i,
        violation: v,
        decision: computeFilterDecision(v),
      }))
    );
    const model = getModelInfoFromEnv();

    try {
      const filePath = writeDebugRunArtifact(process.cwd(), runId, {
        file: relFile,
        ...(Object.keys(model).length > 0 ? { model } : {}),
        ...(model.tag !== undefined ? { subdir: model.tag } : {}),
        prompt: {
          pack: promptFile.pack,
          id: promptId,
          filename: promptFile.filename,
          evaluation_type: "judge",
        },
        raw_model_output: (result as { raw_model_output?: unknown }).raw_model_output ?? null,
        filter_decisions: flat.map((x) => ({
          criterion: x.criterion,
          index: x.index,
          surface: x.decision.surface,
          reasons: x.decision.reasons,
        })),
        surfaced_violations: flat.filter((x) => x.decision.surface).map((x) => ({
          criterion: x.criterion,
          violation: x.violation,
        })),
      });
      console.warn(`[vectorlint] Debug JSON written: ${filePath}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[vectorlint] Debug JSON write failed: ${message}`);
    }
  }

  return {
    errors: promptErrors,
    warnings: promptWarnings,
    hadOperationalErrors,
    hadSeverityErrors,
    scoreEntries: criterionScores,
  };
}

/*
 * Runs a single prompt evaluation.
 * BaseEvaluator auto-detects mode from criteria presence:
 * - criteria defined → scored mode
 * - no criteria → basic mode
 */
async function runPromptEvaluation(
  params: RunPromptEvaluationParams
): Promise<RunPromptEvaluationResult> {
  const { promptFile, relFile, content, provider, searchProvider } = params;

  try {
    const meta = promptFile.meta;

    const evaluatorType = resolveEvaluatorType(meta.evaluator);

    // Specialized evaluators (e.g., technical-accuracy) require criteria
    // BaseEvaluator handles both modes: scored (with criteria) and basic (without)
    if (evaluatorType !== (Type.BASE as string)) {
      if (
        !meta ||
        !Array.isArray(meta.criteria) ||
        meta.criteria.length === 0
      ) {
        throw new Error(
          `Prompt ${promptFile.filename} has no criteria in frontmatter`
        );
      }
    }
    const evaluator = createEvaluator(
      evaluatorType,
      provider,
      promptFile,
      searchProvider
    );
    const result = await evaluator.evaluate(relFile, content);


    const resultObj: RunPromptEvaluationResultSuccess = { ok: true, result };

    return resultObj;
  } catch (e: unknown) {
    const err = handleUnknownError(e, `Running prompt ${promptFile.filename}`);
    return { ok: false, error: err };
  }
}

/*
 * Evaluates a single file with all applicable prompts.
 */
async function evaluateFile(
  params: EvaluateFileParams
): Promise<EvaluateFileResult> {
  const { file, options, jsonFormatter } = params;
  const {
    prompts,
    provider,
    searchProvider,
    concurrency,
    scanPaths,
    outputFormat = OutputFormat.Line,
    verbose,
    debugJson,
  } = options;

  let hadOperationalErrors = false;
  let hadSeverityErrors = false;
  let totalErrors = 0;
  let totalWarnings = 0;
  let requestFailures = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  const allScores = new Map<string, EvaluationSummary[]>();

  const content = readFileSync(file, "utf-8");
  const relFile = path.relative(process.cwd(), file) || file;

  if (outputFormat === OutputFormat.Line) {
    printFileHeader(relFile);
  }

  // Determine applicable prompts for this file
  const toRun: PromptFile[] = [];

  if (scanPaths && scanPaths.length > 0) {
    const resolver = new ScanPathResolver();
    // Extract available packs from loaded prompts
    const availablePacks = Array.from(
      new Set(prompts.map((p) => p.pack).filter((p): p is string => !!p))
    );

    const resolution = resolver.resolveConfiguration(
      relFile,
      scanPaths,
      availablePacks
    );

    // Filter prompts by active packs - only runs if explicitly in RunRules
    const activePrompts = prompts.filter((p) => {
      // Prompts with empty pack (style guide only) always run
      if (p.pack === '') return true;
      if (!p.pack || !resolution.packs.includes(p.pack)) return false;
      if (!p.meta?.id) return true;
      const disableKey = `${p.pack}.${p.meta.id}`;
      const overrideValue = resolution.overrides[disableKey];
      return (
        typeof overrideValue !== "string" ||
        overrideValue.toLowerCase() !== "disabled"
      );
    });

    toRun.push(...activePrompts);
  } else {
    // Fallback: When no scanPaths configured, run all prompts.
    toRun.push(...prompts);
  }

  // If no rules matched but VECTORLINT.md exists, run an evaluation using it.
  // The LLM will use the VECTORLINT.md content from the system prompt.
  if (options.userInstructionContent) {
    toRun.push({
      id: USER_INSTRUCTION_FILENAME,
      filename: USER_INSTRUCTION_FILENAME,
      fullPath: USER_INSTRUCTION_FILENAME,
      pack: '',
      body: '',
      meta: {
        id: USER_INSTRUCTION_FILENAME,
        name: USER_INSTRUCTION_FILENAME,
        severity: Severity.WARNING,
      },
    });
  }

  const progress = outputFormat === OutputFormat.Line
    ? new ProgressReporter({
      runningText: LINT_PROGRESS_TEXT,
      doneText: PROGRESS_DONE_TEXT,
    })
    : undefined;
  progress?.start();

  const results = await (async () => {
    try {
      return await runWithConcurrency(
        toRun,
        concurrency,
        async (prompt) => {
          return runPromptEvaluation({
            promptFile: prompt,
            relFile,
            content,
            provider,
            ...(searchProvider !== undefined && { searchProvider }),
          });
        }
      );
    } finally {
      progress?.stop();
    }
  })();

  // Aggregate results from each prompt
  for (let idx = 0; idx < toRun.length; idx++) {
    const p = toRun[idx];
    const r = results[idx];
    if (!p || !r) continue;

    if (r.ok !== true) {
      // Check if this is a missing dependency error - if so, skip gracefully
      if (r.error instanceof MissingDependencyError) {
        console.warn(`[vectorlint] Skipping ${p.filename}: ${r.error.message}`);
        if (r.error.hint) {
          console.warn(`[vectorlint] Hint: ${r.error.hint}`);
        }
        // Skip this evaluation entirely - don't count it as a failure
        continue;
      }

      // Other errors are actual failures
      console.error(`  Prompt failed: ${p.filename}`);
      console.error(r.error);
      hadOperationalErrors = true;
      requestFailures += 1;
      continue;
    }

    // Accumulate token usage
    if (r.result.usage) {
      totalInputTokens += r.result.usage.inputTokens;
      totalOutputTokens += r.result.usage.outputTokens;
    }

    const promptResult = routePromptResult({
      promptFile: p,
      result: r.result,
      content,
      relFile,
      outputFormat,
      jsonFormatter,
      verbose,
      ...(debugJson !== undefined ? { debugJson } : {}),
    });
    totalErrors += promptResult.errors;
    totalWarnings += promptResult.warnings;
    hadOperationalErrors =
      hadOperationalErrors || promptResult.hadOperationalErrors;
    hadSeverityErrors = hadSeverityErrors || promptResult.hadSeverityErrors;

    if (promptResult.scoreEntries && promptResult.scoreEntries.length > 0) {
      const ruleName = (p.meta.id || p.filename).toString();
      allScores.set(ruleName, promptResult.scoreEntries);
    }
  }

  const tokenUsageStats: TokenUsageStats = {
    totalInputTokens,
    totalOutputTokens,
  };

  if (outputFormat === OutputFormat.Line) {
    printEvaluationSummaries(allScores);
    console.log("");
  }

  return {
    errors: totalErrors,
    warnings: totalWarnings,
    requestFailures,
    hadOperationalErrors,
    hadSeverityErrors,
    tokenUsage: tokenUsageStats
  };
}

/*
 * Runs evaluations across all target files with configurable concurrency.
 * Coordinates prompt-to-file mapping, evaluation execution, and result aggregation.
 * Returns aggregated results for reporting.
 */
export async function evaluateFiles(
  targets: string[],
  options: EvaluationOptions
): Promise<EvaluationResult> {
  if (options.mode === AGENT_EVALUATION_MODE) {
    return runAgentMode(targets, options);
  }

  const { outputFormat = OutputFormat.Line } = options;

  let hadOperationalErrors = false;
  let hadSeverityErrors = false;
  let totalFiles = 0;
  let totalErrors = 0;
  let totalWarnings = 0;
  let requestFailures = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  let jsonFormatter: ValeJsonFormatter | JsonFormatter | RdJsonFormatter;
  if (outputFormat === OutputFormat.Json) {
    jsonFormatter = new JsonFormatter();
  } else if (outputFormat === OutputFormat.RdJson) {
    jsonFormatter = new RdJsonFormatter();
  } else {
    jsonFormatter = new ValeJsonFormatter();
  }

  for (const file of targets) {
    try {
      totalFiles += 1;
      const fileResult = await evaluateFile({ file, options, jsonFormatter });
      totalErrors += fileResult.errors;
      totalWarnings += fileResult.warnings;
      requestFailures += fileResult.requestFailures;
      hadOperationalErrors =
        hadOperationalErrors || fileResult.hadOperationalErrors;
      hadSeverityErrors = hadSeverityErrors || fileResult.hadSeverityErrors;

      // Aggregate token usage
      if (fileResult.tokenUsage) {
        totalInputTokens += fileResult.tokenUsage.totalInputTokens;
        totalOutputTokens += fileResult.tokenUsage.totalOutputTokens;
      }
    } catch (e: unknown) {
      const err = handleUnknownError(e, `Processing file ${file}`);
      console.error(`Error processing file ${file}: ${err.message}`);
      hadOperationalErrors = true;
    }
  }

  // Output results based on format (always to stdout for JSON formats)
  if (
    outputFormat === OutputFormat.Json ||
    outputFormat === OutputFormat.ValeJson ||
    outputFormat === OutputFormat.RdJson
  ) {
    const jsonStr = jsonFormatter.toJson();
    console.log(jsonStr);
  }

  // Calculate aggregated token usage stats
  const tokenUsage: TokenUsageStats = {
    totalInputTokens,
    totalOutputTokens,
  };

  // Calculate cost if pricing is configured
  const cost = calculateCost({
    inputTokens: totalInputTokens,
    outputTokens: totalOutputTokens
  }, options.pricing);
  if (cost !== undefined) {
    tokenUsage.totalCost = cost;
  }

  return {
    totalFiles,
    totalErrors,
    totalWarnings,
    requestFailures,
    hadOperationalErrors,
    hadSeverityErrors,
    tokenUsage,
  };
}
