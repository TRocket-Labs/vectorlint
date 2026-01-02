import type { LLMProvider } from "../providers/llm-provider";
import type { PromptFile } from "../schemas/prompt-schemas";
import type { TokenUsage } from "../providers/token-usage";
import {
  buildSubjectiveLLMSchema,
  buildSemiObjectiveLLMSchema,
  type SubjectiveLLMResult,
  type SemiObjectiveLLMResult,
  type SubjectiveResult,
  type SemiObjectiveResult,
  type EvaluationResult,
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
  calculateSemiObjectiveScore,
  calculateSubjectiveScore,
  averageSubjectiveScores,
} from "../scoring";
import { prependLineNumbers } from "../output/line-numbering";

const CHUNKING_THRESHOLD = 600; // Word count threshold for enabling chunking
const MAX_CHUNK_SIZE = 500; // Maximum words per chunk

/*
 * Core LLM-based evaluator that handles Subjective and Semi-Objective evaluation modes.
 * Mode is determined by prompt frontmatter 'type' field:
 * - 'subjective': Weighted average of 1-4 scores per criterion, normalized to 1-10.
 * - 'semi-objective': Density-based scoring (errors per 100 words).
 *
 * Content is automatically chunked for documents >600 words to improve accuracy.
 *
 * Subclasses can override protected methods to customize evaluation behavior
 * while reusing the core evaluation logic.
 */
export class BaseEvaluator implements Evaluator {
  constructor(
    protected llmProvider: LLMProvider,
    protected prompt: PromptFile,
    protected defaultSeverity?: Severity
  ) { }

  async evaluate(_file: string, content: string): Promise<EvaluationResult> {
    const type = this.getEvaluationType();

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
    return this.prompt.meta.type === "judge"
      ? EvaluationType.JUDGE
      : EvaluationType.CHECK;
  }

  protected chunkContent(content: string): Chunk[] {
    const wordCount = countWords(content) || 1;

    const chunkingEnabled = this.prompt.meta.evaluateAs !== "document";

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
  ): Promise<SubjectiveResult> {
    const schema = buildSubjectiveLLMSchema();

    // Prepend line numbers for deterministic line reporting
    const numberedContent = prependLineNumbers(content);
    const chunks = this.chunkContent(numberedContent);
    const usages: (TokenUsage | undefined)[] = [];

    // Single chunk - run directly
    if (chunks.length === 1) {
      const { data: llmResult, usage } =
        await this.llmProvider.runPromptStructured<SubjectiveLLMResult>(
          numberedContent,
          this.prompt.body,
          schema
        );

      const result = calculateSubjectiveScore(llmResult.criteria, {
        promptCriteria: this.prompt.meta.criteria,
      });

      return {
        ...result,
        ...(usage && { usage }),
      };
    }

    // Multiple chunks - evaluate each and average
    const chunkResults: SubjectiveResult[] = [];
    const chunkWordCounts: number[] = [];

    for (const chunk of chunks) {
      const { data: llmResult, usage } =
        await this.llmProvider.runPromptStructured<SubjectiveLLMResult>(
          chunk.content,
          this.prompt.body,
          schema
        );

      usages.push(usage);

      const result = calculateSubjectiveScore(llmResult.criteria, {
        promptCriteria: this.prompt.meta.criteria,
      });

      chunkResults.push(result);
      chunkWordCounts.push(countWords(chunk.content));
    }

    // Average scores across chunks
    const result = averageSubjectiveScores(chunkResults, chunkWordCounts);
    const aggregatedUsage = this.aggregateUsage(usages);

    return {
      ...result,
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
  ): Promise<SemiObjectiveResult> {
    const schema = buildSemiObjectiveLLMSchema();

    // Prepend line numbers for deterministic line reporting
    const numberedContent = prependLineNumbers(content);
    const chunks = this.chunkContent(numberedContent);
    const totalWordCount = countWords(content) || 1;

    // Collect all violations from all chunks
    const allChunkViolations: SemiObjectiveLLMResult["violations"][] = [];
    const usages: (TokenUsage | undefined)[] = [];

    for (const chunk of chunks) {
      const { data: llmResult, usage } =
        await this.llmProvider.runPromptStructured<SemiObjectiveLLMResult>(
          chunk.content,
          this.prompt.body,
          schema
        );
      allChunkViolations.push(llmResult.violations);
      usages.push(usage);
    }

    // Merge and deduplicate violations
    const mergedViolations = mergeViolations(allChunkViolations);

    // Calculate score once from all violations
    const result = calculateSemiObjectiveScore(
      mergedViolations,
      totalWordCount,
      {
        strictness: this.prompt.meta.strictness,
        defaultSeverity: this.defaultSeverity,
        promptSeverity: this.prompt.meta.severity,
      }
    );

    const aggregatedUsage = this.aggregateUsage(usages);

    return {
      ...result,
      ...(aggregatedUsage && { usage: aggregatedUsage }),
    };
  }
}

// Register as default evaluator for base type
// Note: EvaluatorFactory signature is (llmProvider, prompt, searchProvider?, defaultSeverity?)
registerEvaluator(
  Type.BASE,
  (llmProvider, prompt, _searchProvider, defaultSeverity) => {
    return new BaseEvaluator(llmProvider, prompt, defaultSeverity);
  }
);
