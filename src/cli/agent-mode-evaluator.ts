import { readFile } from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import type {
  EvaluationOptions,
  EvaluationResult,
} from './types';
import { countWords } from '../chunking/utils';
import { runAgentExecutor, type AgentExecutorResult, type AgentFinding } from '../agent/executor';
import { AgentProgressReporter, shouldEmitAgentProgress } from '../agent/progress';
import { Severity } from '../evaluators/types';
import { printEvaluationSummaries, printFileHeader, type EvaluationSummary } from '../output/reporter';
import { OutputFormat } from './types';
import { createAgentModeCapabilityAccess } from './agent-mode-capability';
import { buildRuleId, normalizeRuleSource } from '../agent/rule-id';
import type { PromptFile } from '../prompts/prompt-loader';
import { calculateCheckScore } from '../scoring';
import { JsonFormatter } from '../output/json-formatter';
import { RdJsonFormatter } from '../output/rdjson-formatter';
import { ValeJsonFormatter } from '../output/vale-json-formatter';
import { reportIssue } from './issue-reporter';

function reportAgentFinding(params: {
  finding: AgentFinding;
  outputFormat: OutputFormat;
  jsonFormatter: ValeJsonFormatter | JsonFormatter | RdJsonFormatter;
}): void {
  const { finding, outputFormat, jsonFormatter } = params;

  reportIssue({
    file: finding.file,
    line: finding.line,
    column: finding.column,
    severity: finding.severity,
    summary: finding.message,
    ruleName: finding.ruleId,
    outputFormat,
    jsonFormatter,
    ...(finding.analysis ? { analysis: finding.analysis } : {}),
    ...(finding.suggestion ? { suggestion: finding.suggestion } : {}),
    ...(finding.fix ? { fix: finding.fix } : {}),
    ...(finding.match ? { match: finding.match } : {}),
  });
}

type AgentRuleScore = {
  ruleId: string;
  score: number;
  scoreText: string;
};

async function getAgentFileWordCount(
  file: string,
  workspaceRoot: string,
  cache: Map<string, number>
): Promise<number> {
  const workspaceRelative = path.relative(workspaceRoot, path.resolve(workspaceRoot, file)) || file;
  if (cache.has(workspaceRelative)) {
    return cache.get(workspaceRelative)!;
  }

  const absolutePath = path.resolve(workspaceRoot, workspaceRelative);
  try {
    const content = await readFile(absolutePath, 'utf-8');
    const words = Math.max(1, countWords(content) || 1);
    cache.set(workspaceRelative, words);
    return words;
  } catch {
    cache.set(workspaceRelative, 1);
    return 1;
  }
}

async function buildAgentRuleScores(
  findings: AgentFinding[],
  prompts: PromptFile[],
  fileRuleMatches: Array<{ file: string; ruleSource: string }>,
  workspaceRoot: string
): Promise<AgentRuleScore[]> {
  const fileWordCountCache = new Map<string, number>();
  const findingsByRule = new Map<string, AgentFinding[]>();
  const filesByRuleSource = new Map<string, Set<string>>();

  for (const finding of findings) {
    const existing = findingsByRule.get(finding.ruleId) ?? [];
    existing.push(finding);
    findingsByRule.set(finding.ruleId, existing);
  }
  for (const match of fileRuleMatches) {
    const files = filesByRuleSource.get(match.ruleSource) ?? new Set<string>();
    files.add(match.file);
    filesByRuleSource.set(match.ruleSource, files);
  }

  const results: AgentRuleScore[] = [];
  for (const prompt of prompts) {
    const ruleId = buildRuleId(prompt);
    const ruleFindings = findingsByRule.get(ruleId) ?? [];
    const matchedFiles = filesByRuleSource.get(normalizeRuleSource(prompt.fullPath)) ?? new Set<string>();

    if (matchedFiles.size === 0) {
      results.push({
        ruleId,
        score: 10,
        scoreText: '10.0/10',
      });
      continue;
    }

    let totalWords = 0;
    for (const file of matchedFiles) {
      totalWords += await getAgentFileWordCount(file, workspaceRoot, fileWordCountCache);
    }

    const syntheticViolations = Array.from({ length: ruleFindings.length }, (_, index) => ({
      line: index + 1,
      description: 'Agent finding',
      analysis: 'Agent finding',
    }));

    const scored = calculateCheckScore(
      syntheticViolations,
      Math.max(1, totalWords),
      {
        strictness: prompt.meta.strictness,
        promptSeverity: prompt.meta.severity,
      }
    );

    results.push({
      ruleId,
      score: scored.final_score,
      scoreText: `${scored.final_score.toFixed(1)}/10`,
    });
  }
  return results;
}

function inferAgentWorkspaceRoot(targets: string[]): string {
  if (targets.length === 0) {
    return process.cwd();
  }

  const directories = targets.map((target) => path.dirname(path.resolve(target)));
  let root = directories[0]!;

  for (const directory of directories.slice(1)) {
    root = commonPathPrefix(root, directory);
  }

  return root;
}

function commonPathPrefix(left: string, right: string): string {
  let candidate = path.resolve(left);
  const target = path.resolve(right);

  while (true) {
    const relative = path.relative(candidate, target);
    const insideCandidate = !relative.startsWith('..') && !path.isAbsolute(relative);
    if (insideCandidate) {
      return candidate;
    }

    const parent = path.dirname(candidate);
    if (parent === candidate) {
      return candidate;
    }
    candidate = parent;
  }
}

export async function evaluateFilesInAgentMode(
  targets: string[],
  options: EvaluationOptions,
  outputFormat: OutputFormat,
  jsonFormatter: ValeJsonFormatter | JsonFormatter | RdJsonFormatter
): Promise<EvaluationResult> {
  const workspaceRoot = inferAgentWorkspaceRoot(targets);
  const { defaultProvider, resolveCapabilityProvider } = createAgentModeCapabilityAccess(options);
  const progressReporter = new AgentProgressReporter(
    shouldEmitAgentProgress({
      outputFormat,
      printMode: options.printMode ?? false,
    })
  );

  const agentResult: AgentExecutorResult = await runAgentExecutor({
    targets,
    prompts: options.prompts,
    provider: defaultProvider,
    resolveCapabilityProvider,
    workspaceRoot,
    scanPaths: options.scanPaths,
    outputFormat,
    printMode: options.printMode ?? false,
    sessionHomeDir: os.homedir(),
    progressReporter,
    maxParallelToolCalls: 3,
    maxRetries: options.agentMaxRetries ?? 10,
    userInstructions: options.userInstructionContent,
  });

  let totalErrors = 0;
  let totalWarnings = 0;
  const printedFileHeaders = new Set<string>();
  for (const finding of agentResult.findings) {
    if (outputFormat === OutputFormat.Line && !printedFileHeaders.has(finding.file)) {
      printFileHeader(finding.file);
      printedFileHeaders.add(finding.file);
    }
    reportAgentFinding({ finding, outputFormat, jsonFormatter });
    if (finding.severity === Severity.ERROR) {
      totalErrors += 1;
    } else {
      totalWarnings += 1;
    }
  }

  if (outputFormat === OutputFormat.Line) {
    const ruleScores = await buildAgentRuleScores(
      agentResult.findings,
      options.prompts,
      agentResult.fileRuleMatches,
      workspaceRoot
    );
    const scoreSummary = new Map<string, EvaluationSummary[]>(
      ruleScores.map((entry) => [
        entry.ruleId,
        [{ id: 'overall', scoreText: entry.scoreText, score: entry.score }],
      ])
    );
    printEvaluationSummaries(scoreSummary);

    if (agentResult.hadOperationalErrors) {
      const message = agentResult.errorMessage ?? 'Agent run encountered an operational error.';
      console.error(`\n[agent] ${message}`);
    }
  }

  if (
    outputFormat === OutputFormat.Json ||
    outputFormat === OutputFormat.ValeJson ||
    outputFormat === OutputFormat.RdJson
  ) {
    console.log(jsonFormatter.toJson());
  }

  const tokenUsage = {
    totalInputTokens: agentResult.usage?.inputTokens ?? 0,
    totalOutputTokens: agentResult.usage?.outputTokens ?? 0,
  };

  return {
    totalFiles: targets.length,
    totalErrors,
    totalWarnings,
    requestFailures: agentResult.requestFailures,
    hadOperationalErrors: agentResult.hadOperationalErrors,
    hadSeverityErrors: totalErrors > 0,
    tokenUsage,
  };
}
