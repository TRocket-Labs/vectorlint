/**
 * Batched Check Evaluator
 *
 * Evaluates multiple Check-type rules in a single LLM call per chunk.
 * This significantly reduces token usage by sending content only once.
 *
 * Key differences from BaseEvaluator:
 * - Accepts multiple rules instead of a single prompt
 * - Returns a Map of rule_id -> SemiObjectiveResult
 * - Uses batched prompt template and schema
 */

import type { LLMProvider } from "../providers/llm-provider";
import type { PromptFile } from "../schemas/prompt-schemas";
import type { TokenUsage } from "../providers/token-usage";
import {
  buildBatchedCheckLLMSchema,
  type BatchedCheckLLMResult,
  type SemiObjectiveResult,
  type SemiObjectiveItem,
} from "../prompts/schema";
import { Severity } from "./types";
import {
  mergeViolations,
  RecursiveChunker,
  countWords,
  type Chunk,
} from "../chunking";
import { calculateSemiObjectiveScore } from "../scoring";
import { prependLineNumbers } from "../output/line-numbering";
import {
  buildBatchedCheckPrompt,
  extractBatchedRuleContexts,
  groupIntoBatches,
} from "../prompts/batched-prompt-builder";

const CHUNKING_THRESHOLD = 600; // Word count threshold for enabling chunking
const MAX_CHUNK_SIZE = 500; // Maximum words per chunk
const DEFAULT_MAX_RULES_PER_BATCH = 5; // Default batch size to mitigate "lost in the middle"

/**
 * Result for a single rule within a batched evaluation.
 */
export interface BatchedRuleResult {
  ruleId: string;
  result: SemiObjectiveResult;
}

/**
 * Options for batched check evaluation.
 */
export interface BatchedCheckEvaluatorOptions {
  maxRulesPerBatch?: number;
  defaultSeverity?: typeof Severity.WARNING | typeof Severity.ERROR | undefined;
}

/**
 * Evaluator that processes multiple Check-type rules in batched LLM calls.
 *
 * TODO: Clean up or refactor this class.
 * This implementation was part of the "Rule Batching Optimization" experiment.
 * Validation showed that batching complex rules leads to significant accuracy loss (~60-90% drop in recall).
 * The feature is currently disabled by default (BatchRules=false).
 * If future prompt engineering solves the "lost in the middle" problem, this class can be reactivated.
 * Otherwise, it may be candidate for removal to reduce technical debt.
 */
export class BatchedCheckEvaluator {
  private maxRulesPerBatch: number;
  private defaultSeverity: typeof Severity.WARNING | typeof Severity.ERROR | undefined;

  constructor(
    private llmProvider: LLMProvider,
    private rules: PromptFile[],
    options: BatchedCheckEvaluatorOptions = {}
  ) {
    this.maxRulesPerBatch = options.maxRulesPerBatch ?? DEFAULT_MAX_RULES_PER_BATCH;
    this.defaultSeverity = options.defaultSeverity ?? undefined;

    if (rules.length === 0) {
      throw new Error("BatchedCheckEvaluator requires at least one rule");
    }

    // Validate all rules are Check type
    for (const rule of rules) {
      const ruleType = rule.meta.type;
      if (ruleType === "judge") {
        throw new Error(
          `BatchedCheckEvaluator only supports Check-type rules, but got Judge-type: ${rule.meta.id || rule.filename}`
        );
      }
    }
  }

  /**
   * Evaluates all rules against the content and returns results per rule.
   */
  async evaluate(
    _file: string,
    content: string
  ): Promise<Map<string, SemiObjectiveResult>> {
    // Prepend line numbers for deterministic line reporting
    const numberedContent = prependLineNumbers(content);
    const chunks = this.chunkContent(numberedContent);
    const totalWordCount = countWords(content) || 1;

    // Extract rule contexts for prompt building
    const ruleContexts = extractBatchedRuleContexts(this.rules);

    // Build rule ID to PromptFile map for scoring options
    const ruleMap = new Map<string, PromptFile>();
    for (const rule of this.rules) {
      const ruleId = (rule.meta.id || rule.filename.replace(/\.md$/, "")).toString();
      ruleMap.set(ruleId, rule);
    }

    // Group rules into batches to mitigate "lost in the middle"
    const ruleBatches = groupIntoBatches(ruleContexts, this.maxRulesPerBatch);

    // Collect violations per rule across all chunks and batches
    const violationsByRule = new Map<string, SemiObjectiveItem[][]>();
    for (const ctx of ruleContexts) {
      violationsByRule.set(ctx.id, []);
    }

    const usages: (TokenUsage | undefined)[] = [];

    // Process each batch of rules
    for (const batch of ruleBatches) {
      const ruleIds = batch.map((r) => r.id);
      const batchedPrompt = buildBatchedCheckPrompt(batch);
      const schema = buildBatchedCheckLLMSchema(ruleIds);

      // Process each chunk with the batched prompt
      for (const chunk of chunks) {
        const { data: llmResult, usage } =
          await this.llmProvider.runPromptStructured<BatchedCheckLLMResult>(
            chunk.content,
            batchedPrompt,
            schema
          );

        usages.push(usage);

        // Distribute violations to their respective rules
        for (const ruleResult of llmResult.rules) {
          const ruleViolations = violationsByRule.get(ruleResult.rule_id);
          if (ruleViolations) {
            // Convert to SemiObjectiveItem format, filtering out undefined values
            const items: SemiObjectiveItem[] = ruleResult.violations.map((v) => {
              const item: SemiObjectiveItem = {
                description: v.description,
                analysis: v.analysis,
              };
              if (v.suggestion) item.suggestion = v.suggestion;
              if (v.quoted_text) item.quoted_text = v.quoted_text;
              if (v.context_before) item.context_before = v.context_before;
              if (v.context_after) item.context_after = v.context_after;
              return item;
            });
            ruleViolations.push(items);
          }
        }
      }
    }

    // Calculate scores for each rule
    const results = new Map<string, SemiObjectiveResult>();
    const aggregatedUsage = this.aggregateUsage(usages);
    const usagePerRule = this.distributeUsage(aggregatedUsage, this.rules.length);

    for (const [ruleId, chunkViolations] of violationsByRule) {
      const rule = ruleMap.get(ruleId);
      const mergedViolations = mergeViolations(chunkViolations);

      const result = calculateSemiObjectiveScore(mergedViolations, totalWordCount, {
        strictness: rule?.meta.strictness,
        defaultSeverity: this.defaultSeverity,
        promptSeverity: rule?.meta.severity,
      });

      results.set(ruleId, {
        ...result,
        ...(usagePerRule && { usage: usagePerRule }),
      });
    }

    return results;
  }

  /**
   * Chunks content if it exceeds the threshold.
   * Respects evaluateAs: "document" setting (checks first rule's setting).
   */
  private chunkContent(content: string): Chunk[] {
    const wordCount = countWords(content) || 1;

    // Check if any rule requires document-level evaluation
    const anyDocumentLevel = this.rules.some(
      (r) => r.meta.evaluateAs === "document"
    );

    if (anyDocumentLevel || wordCount <= CHUNKING_THRESHOLD) {
      return [{ content, index: 0 }];
    }

    const chunker = new RecursiveChunker();
    return chunker.chunk(content, { maxChunkSize: MAX_CHUNK_SIZE });
  }

  /**
   * Aggregates token usage from multiple LLM calls.
   */
  private aggregateUsage(
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

  /**
   * Distributes total usage evenly across rules for reporting.
   */
  private distributeUsage(
    totalUsage: TokenUsage | undefined,
    ruleCount: number
  ): TokenUsage | undefined {
    if (!totalUsage || ruleCount === 0) return undefined;

    return {
      inputTokens: Math.round(totalUsage.inputTokens / ruleCount),
      outputTokens: Math.round(totalUsage.outputTokens / ruleCount),
    };
  }
}

/**
 * Checks if a rule can be batched.
 * Rules can be batched if:
 * - Type is "check" (not "judge")
 * - Evaluator is "base" or not specified
 * - Does not have template variables (no {{claims}} etc.)
 */
export function canBatchRule(rule: PromptFile): boolean {
  const ruleType = rule.meta.type;
  const evaluator = rule.meta.evaluator;

  // Only Check-type rules can be batched (Judge type cannot)
  if (ruleType === "judge") {
    return false;
  }

  // Only base evaluator can be batched (not technical-accuracy, etc.)
  if (evaluator && evaluator !== "base") {
    return false;
  }

  // Rules with template variables cannot be batched
  // (they require preprocessing like claim extraction)
  const templatePattern = /\{\{\s*[\w.]+\s*\}\}/;
  if (templatePattern.test(rule.body)) {
    return false;
  }

  return true;
}

/**
 * Groups rules into batchable and non-batchable categories.
 */
export function partitionRulesByBatchability(
  rules: PromptFile[]
): { batchable: PromptFile[]; nonBatchable: PromptFile[] } {
  const batchable: PromptFile[] = [];
  const nonBatchable: PromptFile[] = [];

  for (const rule of rules) {
    if (canBatchRule(rule)) {
      batchable.push(rule);
    } else {
      nonBatchable.push(rule);
    }
  }

  return { batchable, nonBatchable };
}
