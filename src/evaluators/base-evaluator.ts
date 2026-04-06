import type { LLMProvider } from "../providers/llm-provider";
import type { RuleFile } from "../schemas/rule-schemas";
import type { TokenUsage } from "../providers/token-usage";
import {
  buildJudgeLLMSchema,
  buildCheckLLMSchema,
  type JudgeLLMResult,
  type CheckLLMResult,
  type JudgeResult,
  type RawCheckResult,
  type PromptEvaluationResult,
} from "../prompts/schema";
import { registerEvaluator } from "./evaluator-registry";
import type { Evaluator } from "./evaluator";
import { Type, Severity, EvaluationType } from "./types";
import {
  mergeViolations,
  RecursiveChunker,
  countWords,
  type Chunk,
} from "../chunking";
import {
  calculateJudgeScore,
  averageJudgeScores,
} from "../scoring";
import { prependLineNumbers } from "../output/line-numbering";
import { composeSystemPrompt } from "../prompts/system-prompt";
import type { StructuredPromptContext } from "./evaluator-registry";

const CHUNKING_THRESHOLD = 600; // Word count threshold for enabling chunking
const MAX_CHUNK_SIZE = 500; // Maximum words per chunk

/*
 * Core LLM-based evaluator that handles Judge and Check evaluation modes.
 * Mode is determined by prompt frontmatter 'type' field:
 * - 'judge': Weighted average of 1-4 scores per criterion, normalized to 1-10.
 * - 'check': Density-based scoring (errors per 100 words).
 *
 * Content is automatically chunked for documents >600 words to improve accuracy.
 *
 * Subclasses can override protected methods to customize evaluation behavior
 * while reusing the core evaluation logic.
 */
export class BaseEvaluator implements Evaluator {
  constructor(
    protected llmProvider: LLMProvider,
    protected rule: RuleFile,
    protected defaultSeverity?: Severity,
    protected structuredPromptContext?: StructuredPromptContext
  ) { }

  async evaluate(file: string, content: string): Promise<PromptEvaluationResult> {
    const type = this.getEvaluationType();
    // Keep signature compatibility for evaluators that depend on file path.
    void file;

    if (type === EvaluationType.JUDGE) {
      return this.runJudgeEvaluation(content);
    } else {
      return this.runCheckEvaluation(content);
    }
  }

  /*
   * Determines the evaluation type.
   * Defaults to 'check' if not specified, for backward compatibility.
   */
  protected getEvaluationType():
    | typeof EvaluationType.JUDGE
    | typeof EvaluationType.CHECK {
    // After Zod transform, type will be 'judge' or 'check' (or undefined)
    return this.rule.meta.type === "judge"
      ? EvaluationType.JUDGE
      : EvaluationType.CHECK;
  }

  protected chunkContent(content: string): Chunk[] {
    const wordCount = countWords(content) || 1;

    const chunkingEnabled = this.rule.meta.evaluateAs !== "document";

    if (!chunkingEnabled || wordCount <= CHUNKING_THRESHOLD) {
      // Chunking disabled or content is small enough - return as single chunk
      return [
        {
          content,
          index: 0,
        },
      ];
    }

    const chunker = new RecursiveChunker();
    return chunker.chunk(content, { maxChunkSize: MAX_CHUNK_SIZE });
  }

  /**
   * Aggregates token usage from multiple LLM calls.
   */
  protected aggregateUsage(
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

  /*
   * Runs judge evaluation:
   * 1. Prepend line numbers for accurate LLM line reporting.
   * 2. Chunk content if needed.
   * 3. LLM scores each criterion 1-4 for each chunk.
   * 4. Average scores across chunks (weighted by chunk size).
   */
  protected async runJudgeEvaluation(
    content: string
  ): Promise<JudgeResult> {
    const schema = buildJudgeLLMSchema();
    const systemPrompt = this.buildSystemPrompt(this.rule.content);

    // Prepend line numbers for deterministic line reporting
    const numberedContent = prependLineNumbers(content);
    const chunks = this.chunkContent(numberedContent);
    const usages: (TokenUsage | undefined)[] = [];

    // Single chunk - run directly
    if (chunks.length === 1) {
      const { data: llmResult, usage } =
        await this.llmProvider.runPromptStructured<JudgeLLMResult>(
          systemPrompt,
          numberedContent,
          schema
        );

      const result = calculateJudgeScore(llmResult.criteria, {
        promptCriteria: this.rule.meta.criteria,
      });

      return {
        ...result,
        raw_model_output: llmResult,
        ...(usage && { usage }),
      };
    }

    // Multiple chunks - evaluate each and average
    const chunkResults: JudgeResult[] = [];
    const chunkWordCounts: number[] = [];
    const rawChunkOutputs: JudgeLLMResult[] = [];

    for (const chunk of chunks) {
      const { data: llmResult, usage } =
        await this.llmProvider.runPromptStructured<JudgeLLMResult>(
          systemPrompt,
          chunk.content,
          schema
        );

      usages.push(usage);
      rawChunkOutputs.push(llmResult);

      const result = calculateJudgeScore(llmResult.criteria, {
        promptCriteria: this.rule.meta.criteria,
      });

      chunkResults.push(result);
      chunkWordCounts.push(countWords(chunk.content));
    }

    // Average scores across chunks
    const result = averageJudgeScores(chunkResults, chunkWordCounts);
    const aggregatedUsage = this.aggregateUsage(usages);

    return {
      ...result,
      raw_model_output: rawChunkOutputs,
      ...(aggregatedUsage && { usage: aggregatedUsage }),
    };
  }

  /*
   * Runs check evaluation:
   * 1. Prepend line numbers for accurate LLM line reporting.
   * 2. Chunk content if needed.
   * 3. LLM lists violations for each chunk.
   * 4. Merge all violations across chunks.
   * 5. Calculate score once from total violations.
   */
  protected async runCheckEvaluation(
    content: string
  ): Promise<RawCheckResult> {
    const schema = buildCheckLLMSchema();
    const systemPrompt = this.buildSystemPrompt(this.rule.content);

    // Prepend line numbers for deterministic line reporting
    const numberedContent = prependLineNumbers(content);
    const chunks = this.chunkContent(numberedContent);
    const totalWordCount = countWords(content) || 1;

    // Collect all violations from all chunks
    const allChunkViolations: CheckLLMResult["violations"][] = [];
    const rawChunkOutputs: CheckLLMResult[] = [];
    const chunkReasonings: string[] = [];
    const usages: (TokenUsage | undefined)[] = [];

    for (const chunk of chunks) {
      const { data: llmResult, usage } =
        await this.llmProvider.runPromptStructured<CheckLLMResult>(
          systemPrompt,
          chunk.content,
          schema
        );
      allChunkViolations.push(llmResult.violations);
      rawChunkOutputs.push(llmResult);
      if (llmResult.reasoning) chunkReasonings.push(llmResult.reasoning);
      usages.push(usage);
    }

    // Merge and deduplicate violations
    const mergedViolations = mergeViolations(allChunkViolations);

    const aggregatedUsage = this.aggregateUsage(usages);
    const reasoning = chunkReasonings.join(" ").trim() || undefined;

    return {
      type: EvaluationType.CHECK,
      violations: mergedViolations,
      word_count: totalWordCount,
      ...(reasoning && { reasoning }),
      raw_model_output: rawChunkOutputs.length === 1 ? rawChunkOutputs[0] : rawChunkOutputs,
      ...(aggregatedUsage && { usage: aggregatedUsage }),
    };
  }

  protected buildSystemPrompt(instructions: string): string {
    return composeSystemPrompt({
      instructions,
      ...(this.structuredPromptContext?.systemDirective
        ? { directive: this.structuredPromptContext.systemDirective }
        : {}),
      ...(this.structuredPromptContext?.userInstructions
        ? { userInstructions: this.structuredPromptContext.userInstructions }
        : {}),
    });
  }
}

// Register as default evaluator for base type
// Note: EvaluatorFactory signature is (llmProvider, rule, searchProvider?, defaultSeverity?)
registerEvaluator(
  Type.BASE,
  (llmProvider, rule, _searchProvider, defaultSeverity, structuredPromptContext) => {
    return new BaseEvaluator(llmProvider, rule, defaultSeverity, structuredPromptContext);
  }
);
