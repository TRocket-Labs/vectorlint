/**
 * Suggestion Phase Runner - Second phase of two-phase detection/suggestion architecture.
 *
 * The suggestion phase uses a structured LLM prompt to generate actionable suggestions
 * for each issue detected in the first phase. The LLM returns structured JSON with
 * suggestions matched to their corresponding issues by index.
 *
 * This phase receives the full document context to ensure suggestions are coherent
 * and consistent with the overall content, even when the detection phase operates
 * on chunks.
 */

import type { LLMProvider } from "../providers/llm-provider";
import type { TokenUsage } from "../providers/token-usage";
import type { RawDetectionIssue } from "./detection-phase";
import {
  buildSuggestionLLMSchema,
  SUGGESTION_LLM_RESULT_SCHEMA,
  type SuggestionLLMResult,
} from "../prompts/schema";
import { getPrompt } from "./prompt-loader";
import { withRetry } from "./retry";

/**
 * A suggestion for a specific detected issue.
 */
export interface Suggestion {
  /** The index of the issue this suggestion addresses (1-based) */
  issueIndex: number;
  /** Specific, actionable text to replace the problematic content */
  suggestion: string;
  /** Brief explanation of how this suggestion addresses the issue */
  explanation: string;
}

/**
 * Result from the suggestion phase containing suggestions and metadata.
 */
export interface SuggestionResult {
  /** Array of suggestions matched to their corresponding issues */
  suggestions: Suggestion[];
  /** Token usage from the LLM call */
  usage?: TokenUsage;
  /** Raw LLM response for debugging */
  rawResponse: SuggestionLLMResult;
  /** Whether any suggestions were generated */
  hasSuggestions: boolean;
}

/**
 * Options for configuring the suggestion phase run.
 */
export interface SuggestionPhaseOptions {
  /** Maximum number of retry attempts for LLM calls (default: 3) */
  maxRetries?: number;
}

/**
 * SuggestionPhaseRunner runs the second phase of the two-phase evaluation architecture.
 *
 * This class is responsible for:
 * 1. Building the suggestion prompt with content, issues, and criteria
 * 2. Calling the LLM using runPromptStructured for JSON response
 * 3. Returning structured suggestions matched to issues by index
 *
 * The suggestion phase receives the full document content to ensure suggestions
 * are coherent with the overall content, even when chunking is used in the
 * detection phase.
 *
 * @example
 * ```ts
 * const runner = new SuggestionPhaseRunner(llmProvider);
 * const result = await runner.run(fullContent, detectedIssues, criteria);
 * console.log(`Generated ${result.suggestions.length} suggestions`);
 * ```
 */
export class SuggestionPhaseRunner {
  constructor(private readonly llmProvider: LLMProvider) {}

  /**
   * Run the suggestion phase for the provided issues.
   *
   * @param content - The full document content (not just chunks)
   * @param issues - Array of detected issues from the detection phase
   * @param criteria - The evaluation criteria for reference
   * @param options - Optional configuration for the suggestion run
   * @returns Promise resolving to SuggestionResult with suggestions and metadata
   */
  async run(
    content: string,
    issues: RawDetectionIssue[],
    criteria: string,
    options: SuggestionPhaseOptions = {}
  ): Promise<SuggestionResult> {
    const { maxRetries = 3 } = options;

    // Build the suggestion prompt with content, issues, and criteria
    const prompt = this.buildPrompt(content, issues, criteria);

    // Get the structured schema for the LLM call
    const schema = buildSuggestionLLMSchema();

    // Run LLM call with retry logic for transient failures
    const { data: llmResult } = await withRetry(
      () =>
        this.llmProvider.runPromptStructured<SuggestionLLMResult>(
          content,
          prompt,
          schema
        ),
      { maxRetries, context: "suggestion phase" }
    );

    // Runtime validation of LLM response using Zod schema
    const rawResponse = SUGGESTION_LLM_RESULT_SCHEMA.parse(llmResult.data);
    const usage = llmResult.usage;

    // Map the LLM result to our Suggestion interface
    const suggestions: Suggestion[] = rawResponse.suggestions.map((s) => ({
      issueIndex: s.issueIndex,
      suggestion: s.suggestion,
      explanation: s.explanation,
    }));

    const result: SuggestionResult = {
      suggestions,
      rawResponse,
      hasSuggestions: suggestions.length > 0,
    };

    if (usage) {
      result.usage = usage;
    }

    return result;
  }

  /**
   * Build the suggestion prompt by inserting content, issues, and criteria into the template.
   *
   * @param content - The full document content
   * @param issues - Array of detected issues
   * @param criteria - The evaluation criteria
   * @returns The complete prompt text for the suggestion phase
   */
  private buildPrompt(
    content: string,
    issues: RawDetectionIssue[],
    criteria: string
  ): string {
    const template = getPrompt("suggestion-phase");

    // Format issues for inclusion in the prompt
    const issuesText = this.formatIssues(issues);

    return template
      .replace("{content}", content)
      .replace("{issues}", issuesText)
      .replace("{criteria}", criteria);
  }

  /**
   * Format detected issues for inclusion in the suggestion prompt.
   *
   * Creates markdown-formatted issue sections matching the format expected
   * by the suggestion phase template.
   *
   * @param issues - Array of detected issues
   * @returns Markdown-formatted issues text
   */
  private formatIssues(issues: RawDetectionIssue[]): string {
    if (issues.length === 0) {
      return "No issues found.";
    }

    return issues
      .map(
        (issue, index) => `## Issue ${index + 1}

**quotedText:**
> ${issue.quotedText}

**contextBefore:**
${issue.contextBefore || "(none)"}

**contextAfter:**
${issue.contextAfter || "(none)"}

**line:** ${issue.line}

**criterionName:** ${issue.criterionName}

**analysis:**
${issue.analysis}`
      )
      .join("\n\n");
  }
}
