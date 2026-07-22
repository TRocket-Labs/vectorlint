import path from "path";
import type { LLMProvider } from "../providers/llm-provider";
import type { EvalContext } from "../providers/request-builder";
import type { PromptFile } from "../schemas/prompt-schemas";
import type { TokenUsage } from "../providers/token-usage";
import {
  buildEvaluationLLMSchema,
  type EvaluationLLMResult,
  type PromptEvaluationResult,
} from "../prompts/schema";
import { registerEvaluator } from "./evaluator-registry";
import type { Evaluator } from "./evaluator";
import { Type, Severity } from "./types";
import {
  mergeViolations,
  RecursiveChunker,
  countWords,
  type Chunk,
} from "../chunking";
import { prependLineNumbers } from "../output/line-numbering";

const CHUNKING_THRESHOLD = 600; // Word count threshold for enabling chunking
const MAX_CHUNK_SIZE = 500; // Maximum words per chunk

/** Evaluates rule violations, chunking large documents when needed. */
export class BaseEvaluator implements Evaluator {
  constructor(
    protected llmProvider: LLMProvider,
    protected prompt: PromptFile,
    protected defaultSeverity?: Severity
  ) { }

  async evaluate(file: string, content: string): Promise<PromptEvaluationResult> {
    const ext = path.extname(file);
    const context: EvalContext = ext ? { fileType: ext } : {};
    return this.runEvaluation(content, context);
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

  protected async runEvaluation(
    content: string,
    context?: EvalContext
  ): Promise<PromptEvaluationResult> {
    const schema = buildEvaluationLLMSchema();

    // Prepend line numbers for deterministic line reporting
    const numberedContent = prependLineNumbers(content);
    const chunks = this.chunkContent(numberedContent);
    const totalWordCount = countWords(content) || 1;

    // Collect all violations from all chunks
    const allChunkViolations: EvaluationLLMResult["violations"][] = [];
    const rawChunkOutputs: EvaluationLLMResult[] = [];
    const chunkReasonings: string[] = [];
    const usages: (TokenUsage | undefined)[] = [];

    for (const chunk of chunks) {
      const { data: llmResult, usage } =
        await this.llmProvider.runPromptStructured<EvaluationLLMResult>(
          chunk.content,
          this.prompt.body,
          schema,
          context
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
      violations: mergedViolations,
      word_count: totalWordCount,
      ...(reasoning && { reasoning }),
      raw_model_output: rawChunkOutputs.length === 1 ? rawChunkOutputs[0] : rawChunkOutputs,
      ...(aggregatedUsage && { usage: aggregatedUsage }),
    };
  }
}

registerEvaluator(
  Type.BASE,
  (llmProvider, prompt, _searchProvider, defaultSeverity) => {
    return new BaseEvaluator(llmProvider, prompt, defaultSeverity);
  }
);
