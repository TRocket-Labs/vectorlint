import type { LLMProvider } from "../providers/llm-provider";
import type { PromptFile, PromptCriterionSpec } from "../schemas/prompt-schemas";
import type { TokenUsage } from "../providers/token-usage";
import {
  type JudgeResult,
  type CheckResult,
  type PromptEvaluationResult,
} from "../prompts/schema";
import { registerEvaluator } from "./evaluator-registry";
import type { Evaluator } from "./evaluator";
import { Type, Severity, EvaluationType } from "./types";
import {
  RecursiveChunker,
  countWords,
  type Chunk,
} from "../chunking";
import { prependLineNumbers } from "../output/line-numbering";
import { DetectionPhaseRunner, type DetectionResult } from "./detection-phase";
import { SuggestionPhaseRunner, type Suggestion } from "./suggestion-phase";
import { ResultAssembler } from "./result-assembler";

const CHUNKING_THRESHOLD = 600; // Word count threshold for enabling chunking
const MAX_CHUNK_SIZE = 500; // Maximum words per chunk

/*
 * Core LLM-based evaluator that handles Judge and Check evaluation modes.
 * Mode is determined by prompt frontmatter 'type' field:
 * - 'judge': Weighted average of 1-4 scores per criterion, normalized to 1-10.
 * - 'check': Density-based scoring (errors per 100 words).
 *
 * Uses a two-phase detection/suggestion architecture:
 * 1. Detection phase: Identifies issues in content using unstructured LLM calls
 * 2. Suggestion phase: Generates actionable suggestions for detected issues
 *
 * Content is automatically chunked for documents >600 words to improve accuracy.
 * The full document is always passed to the suggestion phase to ensure suggestions
 * are coherent and consistent with the overall content.
 *
 * Subclasses can override protected methods to customize evaluation behavior
 * while reusing the core evaluation logic.
 */
export class BaseEvaluator implements Evaluator {
  private readonly detectionRunner: DetectionPhaseRunner;
  private readonly suggestionRunner: SuggestionPhaseRunner;
  private readonly resultAssembler: ResultAssembler;

  constructor(
    protected llmProvider: LLMProvider,
    protected prompt: PromptFile,
    protected defaultSeverity?: Severity
  ) {
    this.detectionRunner = new DetectionPhaseRunner(llmProvider);
    this.suggestionRunner = new SuggestionPhaseRunner(llmProvider);
    this.resultAssembler = new ResultAssembler();
  }

  async evaluate(_file: string, content: string): Promise<PromptEvaluationResult> {
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
   * Runs judge evaluation using two-phase detection/suggestion architecture:
   * 1. Detection phase: Identifies issues in content (chunked if needed)
   * 2. Suggestion phase: Generates actionable suggestions for detected issues
   * 3. Assemble final judge result from detection + suggestions
   *
   * The full document is always passed to the suggestion phase to ensure
   * suggestions are coherent and consistent with the overall content.
   */
  protected async runJudgeEvaluation(
    content: string
  ): Promise<JudgeResult> {
    // Prepend line numbers for deterministic line reporting
    const numberedContent = prependLineNumbers(content);
    const chunks = this.chunkContent(numberedContent);

    // Build criteria string for phase runners
    const criteriaString = this.buildCriteriaString();

    // Phase 1: Detection - identify issues in each chunk
    const allDetectionResults: DetectionResult[] = [];
    const detectionUsages: (TokenUsage | undefined)[] = [];

    for (const chunk of chunks) {
      const detectionResult = await this.detectionRunner.run(
        chunk.content,
        criteriaString
      );
      allDetectionResults.push(detectionResult);
      detectionUsages.push(detectionResult.usage);
    }

    // Flatten all detection issues from all chunks
    const flatDetectionIssues = allDetectionResults.flatMap((result) => result.issues);

    // Phase 2: Suggestion - generate suggestions using full document context
    // Always use the original (non-chunked) numbered content for suggestion phase
    let suggestionUsage: TokenUsage | undefined;
    let suggestions: Suggestion[] = [];

    if (flatDetectionIssues.length > 0) {
      const suggestionResult = await this.suggestionRunner.run(
        numberedContent, // Full document, not chunks
        flatDetectionIssues,
        criteriaString
      );
      suggestions = suggestionResult.suggestions;
      suggestionUsage = suggestionResult.usage;
    }

    // Phase 3: Assemble final judge result
    const judgeOptions: {
      promptCriteria?: PromptCriterionSpec[];
    } = {};
    if (this.prompt.meta.criteria) {
      judgeOptions.promptCriteria = this.prompt.meta.criteria;
    }
    const result = this.resultAssembler.assembleJudgeResult(
      flatDetectionIssues,
      suggestions,
      judgeOptions
    );

    // Aggregate token usage from both phases
    const aggregatedDetectionUsage = this.aggregateUsage(detectionUsages);
    const totalUsage = this.resultAssembler.aggregateTokenUsage(
      aggregatedDetectionUsage,
      suggestionUsage
    );

    return {
      ...result,
      ...(totalUsage && { usage: totalUsage }),
    };
  }

  /*
   * Runs check evaluation using two-phase detection/suggestion architecture:
   * 1. Detection phase: Identifies issues in content (chunked if needed)
   * 2. Suggestion phase: Generates actionable suggestions for detected issues
   * 3. Assemble final check result from detection + suggestions
   *
   * The full document is always passed to the suggestion phase to ensure
   * suggestions are coherent and consistent with the overall content.
   */
  protected async runCheckEvaluation(
    content: string
  ): Promise<CheckResult> {
    // Prepend line numbers for deterministic line reporting
    const numberedContent = prependLineNumbers(content);
    const chunks = this.chunkContent(numberedContent);
    const totalWordCount = countWords(content) || 1;

    // Build criteria string for phase runners
    const criteriaString = this.buildCriteriaString();

    // Phase 1: Detection - identify issues in each chunk
    const allDetectionResults: DetectionResult[] = [];
    const detectionUsages: (TokenUsage | undefined)[] = [];

    for (const chunk of chunks) {
      const detectionResult = await this.detectionRunner.run(
        chunk.content,
        criteriaString
      );
      allDetectionResults.push(detectionResult);
      detectionUsages.push(detectionResult.usage);
    }

    // Flatten all detection issues from all chunks
    const flatDetectionIssues = allDetectionResults.flatMap((result) => result.issues);

    // Phase 2: Suggestion - generate suggestions using full document context
    // Always use the original (non-chunked) numbered content for suggestion phase
    let suggestionUsage: TokenUsage | undefined;
    let suggestions: Suggestion[] = [];

    if (flatDetectionIssues.length > 0) {
      const suggestionResult = await this.suggestionRunner.run(
        numberedContent, // Full document, not chunks
        flatDetectionIssues,
        criteriaString
      );
      suggestions = suggestionResult.suggestions;
      suggestionUsage = suggestionResult.usage;
    }

    // Phase 3: Assemble final check result
    const checkOptions: {
      severity?: Severity;
      totalWordCount: number;
      strictness?: number | "lenient" | "standard" | "strict";
    } = {
      totalWordCount,
    };
    const resolvedSeverity = this.defaultSeverity ?? this.prompt.meta.severity;
    if (resolvedSeverity !== undefined) {
      checkOptions.severity = resolvedSeverity;
    }
    if (this.prompt.meta.strictness !== undefined) {
      checkOptions.strictness = this.prompt.meta.strictness;
    }
    const result = this.resultAssembler.assembleCheckResult(
      flatDetectionIssues,
      suggestions,
      checkOptions
    );

    // Aggregate token usage from both phases
    const aggregatedDetectionUsage = this.aggregateUsage(detectionUsages);
    const totalUsage = this.resultAssembler.aggregateTokenUsage(
      aggregatedDetectionUsage,
      suggestionUsage
    );

    return {
      ...result,
      ...(totalUsage && { usage: totalUsage }),
    };
  }

  /**
   * Build a criteria string from the prompt's criteria metadata.
   * Used by detection and suggestion phase runners.
   *
   * @returns Formatted criteria string for LLM prompts
   */
  private buildCriteriaString(): string {
    const criteria = this.prompt.meta.criteria;
    if (!criteria || criteria.length === 0) {
      return "No specific criteria provided.";
    }

    return criteria
      .map((c) => {
        const weightText = c.weight ? ` (weight: ${c.weight})` : "";
        return `- ${c.name}${weightText}`;
      })
      .join("\n");
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
