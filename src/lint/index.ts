import type { RuleFile } from "../rules/rule-loader";
import type { LLMProvider } from "../providers/llm-provider";
import type { TokenUsage } from "../providers/token-usage";
import { ReviewType } from "./types";
import {
  mergeViolations,
  RecursiveChunker,
  countWords,
  type Chunk,
} from "../chunking";
import {
  calculateJudgeScore,
  averageJudgeScores,
} from "../scoring/scorer";
import {
  buildJudgeLLMSchema,
  buildCheckLLMSchema,
  buildMergedCheckLLMSchema,
  type JudgeLLMResult,
  type CheckLLMResult,
  type MergedCheckLLMResult,
  type JudgeResult,
  type RawCheckResult,
  type PromptEvaluationResult,
} from "../prompts/schema";
import { composeSystemPrompt } from "../prompts/system-prompt";
import { computeFilterDecision } from "./violation-filter";
import { prependLineNumbers } from "../output/line-numbering";

// Re-export computeFilterDecision for consumers of this module
export { computeFilterDecision };

const CHUNKING_THRESHOLD = 600;
const MAX_CHUNK_SIZE = 500;

// ─── runLint ────────────────────────────────────────────────────────────────

export type RunLintParams = {
  content: string;
  rule: RuleFile;
  provider: LLMProvider;
  options?: {
    systemDirective?: string;
    userInstructions?: string;
  };
};

function chunkContent(rule: RuleFile, content: string): Chunk[] {
  const wordCount = countWords(content) || 1;
  const chunkingEnabled = rule.meta.evaluateAs !== "document";

  if (!chunkingEnabled || wordCount <= CHUNKING_THRESHOLD) {
    return [{ content, index: 0 }];
  }

  const chunker = new RecursiveChunker();
  return chunker.chunk(content, { maxChunkSize: MAX_CHUNK_SIZE });
}

function aggregateUsage(
  usages: (TokenUsage | undefined)[]
): TokenUsage | undefined {
  const validUsages = usages.filter((u): u is TokenUsage => u !== undefined);
  if (validUsages.length === 0) return undefined;

  return validUsages.reduce(
    (acc, u) => ({
      inputTokens: acc.inputTokens + u.inputTokens,
      outputTokens: acc.outputTokens + u.outputTokens,
    }),
    { inputTokens: 0, outputTokens: 0 }
  );
}

function buildSystemPrompt(
  instructions: string,
  options?: { systemDirective?: string; userInstructions?: string }
): string {
  return composeSystemPrompt({
    instructions,
    ...(options?.systemDirective ? { directive: options.systemDirective } : {}),
    ...(options?.userInstructions
      ? { userInstructions: options.userInstructions }
      : {}),
  });
}

async function runJudgeEvaluation(
  content: string,
  rule: RuleFile,
  provider: LLMProvider,
  options?: { systemDirective?: string; userInstructions?: string }
): Promise<JudgeResult> {
  const schema = buildJudgeLLMSchema();
  const systemPrompt = buildSystemPrompt(rule.content, options);
  const numberedContent = prependLineNumbers(content);
  const chunks = chunkContent(rule, numberedContent);
  const usages: (TokenUsage | undefined)[] = [];

  if (chunks.length === 1) {
    const { data: llmResult, usage } =
      await provider.runPromptStructured<JudgeLLMResult>(
        systemPrompt,
        numberedContent,
        schema
      );

    const result = calculateJudgeScore(llmResult.criteria, {
      promptCriteria: rule.meta.criteria,
    });

    return {
      ...result,
      raw_model_output: llmResult,
      ...(usage && { usage }),
    };
  }

  const chunkResults: JudgeResult[] = [];
  const chunkWordCounts: number[] = [];
  const rawChunkOutputs: JudgeLLMResult[] = [];

  for (const chunk of chunks) {
    const { data: llmResult, usage } =
      await provider.runPromptStructured<JudgeLLMResult>(
        systemPrompt,
        chunk.content,
        schema
      );

    usages.push(usage);
    rawChunkOutputs.push(llmResult);

    const result = calculateJudgeScore(llmResult.criteria, {
      promptCriteria: rule.meta.criteria,
    });

    chunkResults.push(result);
    chunkWordCounts.push(countWords(chunk.content));
  }

  const result = averageJudgeScores(chunkResults, chunkWordCounts);
  const aggregatedUsage = aggregateUsage(usages);

  return {
    ...result,
    raw_model_output: rawChunkOutputs,
    ...(aggregatedUsage && { usage: aggregatedUsage }),
  };
}

async function runCheckEvaluation(
  content: string,
  rule: RuleFile,
  provider: LLMProvider,
  options?: { systemDirective?: string; userInstructions?: string }
): Promise<RawCheckResult> {
  const schema = buildCheckLLMSchema();
  const systemPrompt = buildSystemPrompt(rule.content, options);
  const numberedContent = prependLineNumbers(content);
  const chunks = chunkContent(rule, numberedContent);
  const totalWordCount = countWords(content) || 1;

  const allChunkViolations: CheckLLMResult["violations"][] = [];
  const rawChunkOutputs: CheckLLMResult[] = [];
  const chunkReasonings: string[] = [];
  const usages: (TokenUsage | undefined)[] = [];

  for (const chunk of chunks) {
    const { data: llmResult, usage } =
      await provider.runPromptStructured<CheckLLMResult>(
        systemPrompt,
        chunk.content,
        schema
      );
    allChunkViolations.push(llmResult.violations);
    rawChunkOutputs.push(llmResult);
    if (llmResult.reasoning) chunkReasonings.push(llmResult.reasoning);
    usages.push(usage);
  }

  const mergedViolations = mergeViolations(allChunkViolations);
  const aggregatedUsage = aggregateUsage(usages);
  const reasoning = chunkReasonings.join(" ").trim() || undefined;

  return {
    type: ReviewType.CHECK,
    violations: mergedViolations,
    word_count: totalWordCount,
    ...(reasoning && { reasoning }),
    raw_model_output:
      rawChunkOutputs.length === 1 ? rawChunkOutputs[0] : rawChunkOutputs,
    ...(aggregatedUsage && { usage: aggregatedUsage }),
  };
}

export async function runLint(
  params: RunLintParams
): Promise<PromptEvaluationResult> {
  const isJudge = params.rule.meta.type === "judge";

  if (isJudge) {
    return runJudgeEvaluation(
      params.content,
      params.rule,
      params.provider,
      params.options
    );
  }

  return runCheckEvaluation(
    params.content,
    params.rule,
    params.provider,
    params.options
  );
}

// ─── runLintMerged ──────────────────────────────────────────────────────────

export type LintRuleCall = {
  ruleSource: string;
  rule: RuleFile;
  reviewInstruction?: string;
  context?: string;
};

export function resolveRuleContent(
  rule: RuleFile,
  params: { reviewInstruction?: string; context?: string }
): string {
  const reviewInstruction = params.reviewInstruction?.trim();
  const context = params.context?.trim();
  const body = reviewInstruction || rule.content;

  if (!context) {
    return body;
  }

  return `${body}\n\nRequired context for this review:\n${context}`;
}

export function mergeRulesForLint(ruleCalls: LintRuleCall[]): string {
  const sections = ruleCalls.flatMap((ruleCall, index) => [
    `Rule ${index + 1}`,
    `ruleSource: ${ruleCall.ruleSource}`,
    resolveRuleContent(ruleCall.rule, ruleCall),
    "",
  ]);

  return sections.join("\n").trim();
}

export function buildLintSystemPrompt(ruleCalls: LintRuleCall[]): string {
  return [
    "Review the file against all of the following source-backed rules.",
    "Keep findings attributed to the exact ruleSource that each issue belongs to.",
    "",
    mergeRulesForLint(ruleCalls),
  ]
    .join("\n")
    .trim();
}

export type RunLintMergedParams = {
  content: string;
  ruleCalls: LintRuleCall[];
  provider: LLMProvider;
  options?: {
    systemDirective?: string;
    userInstructions?: string;
  };
};

export type MergedLintResult = {
  findings: MergedCheckLLMResult["findings"];
  reasoning?: string;
  usage?: TokenUsage;
};

export async function runLintMerged(
  params: RunLintMergedParams
): Promise<MergedLintResult> {
  const systemPrompt = composeSystemPrompt({
    instructions: buildLintSystemPrompt(params.ruleCalls),
    ...(params.options?.systemDirective
      ? { directive: params.options.systemDirective }
      : {}),
    ...(params.options?.userInstructions
      ? { userInstructions: params.options.userInstructions }
      : {}),
  });

  const result = await params.provider.runPromptStructured<MergedCheckLLMResult>(
    systemPrompt,
    params.content,
    buildMergedCheckLLMSchema()
  );

  return {
    findings: result.data.findings,
    reasoning: result.data.reasoning,
    usage: result.usage,
  };
}
