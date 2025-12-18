import type { LLMProvider } from "../providers/llm-provider";
import type { PromptFile } from "../schemas/prompt-schemas";
import {
  buildSubjectiveLLMSchema,
  buildSemiObjectiveLLMSchema,
  type SubjectiveLLMResult,
  type SemiObjectiveLLMResult,
  type SubjectiveResult,
  type SemiObjectiveResult,
  type EvaluationResult,
  type SemiObjectiveItem,
} from "../prompts/schema";
import { registerEvaluator } from "./evaluator-registry";
import type { Evaluator } from "./evaluator";
import { Type, Severity, EvaluationType } from "./types";
import { mergeViolations, RecursiveChunker, type Chunk } from "../chunking";
import {
  calculateSemiObjectiveScore,
  calculateSubjectiveScore,
  averageSubjectiveScores,
} from "../scoring";

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
  ) {}

  async evaluate(_file: string, content: string): Promise<EvaluationResult> {
    const type = this.getEvaluationType();

    if (type === EvaluationType.SUBJECTIVE) {
      return this.runSubjectiveEvaluation(content);
    } else {
      return this.runSemiObjectiveEvaluation(content);
    }
  }

  /*
   * Determines the evaluation type.
   * Defaults to 'semi-objective' if not specified, for backward compatibility.
   */
  protected getEvaluationType():
    | typeof EvaluationType.SUBJECTIVE
    | typeof EvaluationType.SEMI_OBJECTIVE {
    return this.prompt.meta.type === "subjective"
      ? EvaluationType.SUBJECTIVE
      : EvaluationType.SEMI_OBJECTIVE;
  }

  protected chunkContent(content: string): Chunk[] {
    const wordCount = content.trim().split(/\s+/).length || 1;

    if (wordCount <= CHUNKING_THRESHOLD) {
      // Content is small enough, no chunking needed
      return [
        {
          content,
          startOffset: 0,
          endOffset: content.length,
          index: 0,
        },
      ];
    }

    const chunker = new RecursiveChunker();
    return chunker.chunk(content, { maxChunkSize: MAX_CHUNK_SIZE });
  }

  /*
   * Runs subjective evaluation:
   * 1. Chunk content if needed.
   * 2. LLM scores each criterion 1-4 for each chunk.
   * 3. Average scores across chunks (weighted by chunk size).
   */
  protected async runSubjectiveEvaluation(
    content: string
  ): Promise<SubjectiveResult> {
    const schema = buildSubjectiveLLMSchema();
    const chunks = this.chunkContent(content);

    // Single chunk - run directly
    if (chunks.length === 1) {
      const llmResult =
        await this.llmProvider.runPromptStructured<SubjectiveLLMResult>(
          content,
          this.prompt.body,
          schema
        );

      return calculateSubjectiveScore(llmResult.criteria, {
        promptCriteria: this.prompt.meta.criteria,
      });
    }

    // Multiple chunks - evaluate each and average
    const chunkResults: SubjectiveResult[] = [];
    const chunkWordCounts: number[] = [];

    for (const chunk of chunks) {
      const llmResult =
        await this.llmProvider.runPromptStructured<SubjectiveLLMResult>(
          chunk.content,
          this.prompt.body,
          schema
        );

      const result = calculateSubjectiveScore(llmResult.criteria, {
        promptCriteria: this.prompt.meta.criteria,
      });

      chunkResults.push(result);
      chunkWordCounts.push(chunk.content.trim().split(/\s+/).length);
    }

    // Average scores across chunks
    return averageSubjectiveScores(chunkResults, chunkWordCounts);
  }

  /*
   * Runs semi-objective evaluation:
   * 1. Chunk content if needed.
   * 2. LLM lists violations for each chunk.
   * 3. Merge all violations across chunks.
   * 4. Calculate score once from total violations.
   */
  protected async runSemiObjectiveEvaluation(
    content: string
  ): Promise<SemiObjectiveResult> {
    const schema = buildSemiObjectiveLLMSchema();
    const chunks = this.chunkContent(content);
    const totalWordCount = content.trim().split(/\s+/).length || 1;

    // Collect all violations from all chunks
    const allChunkViolations: SemiObjectiveItem[][] = [];

    for (const chunk of chunks) {
      const llmResult =
        await this.llmProvider.runPromptStructured<SemiObjectiveLLMResult>(
          chunk.content,
          this.prompt.body,
          schema
        );
      allChunkViolations.push(llmResult.violations);
    }

    // Merge and deduplicate violations
    const mergedViolations = mergeViolations(allChunkViolations);

    // Calculate score once from all violations
    return calculateSemiObjectiveScore(mergedViolations, totalWordCount, {
      strictness: this.prompt.meta.strictness,
      defaultSeverity: this.defaultSeverity,
      promptSeverity: this.prompt.meta.severity,
    });
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
