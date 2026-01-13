/**
 * Detection Phase Runner - First phase of two-phase detection/suggestion architecture.
 *
 * The detection phase uses an unstructured LLM prompt to identify issues in content
 * based on specified evaluation criteria. The LLM returns free-form text that
 * follows a markdown format with "Issue N" sections.
 *
 * This phase is followed by the suggestion phase which provides specific
 * suggestions for each detected issue.
 */

import type { LLMProvider } from "../providers/llm-provider";
import type { TokenUsage } from "../providers/token-usage";
import { getPrompt } from "./prompt-loader";
import { withRetry } from "./retry";

/**
 * Raw issue data parsed from the unstructured LLM detection response.
 * This will be further processed by the detection response parser.
 */
export interface RawDetectionIssue {
  /** The exact text from content that violates the criterion */
  quotedText: string;
  /** Text immediately preceding the quoted text */
  contextBefore: string;
  /** Text immediately following the quoted text */
  contextAfter: string;
  /** Line number where the issue occurs (from numbered content) */
  line: number;
  /** Name of the criterion being violated */
  criterionName: string;
  /** Brief explanation of why this text violates the criterion */
  analysis: string;
}

/**
 * Result from the detection phase containing raw issues and metadata.
 */
export interface DetectionResult {
  /** Array of detected issues (empty if none found) */
  issues: RawDetectionIssue[];
  /** Token usage from the LLM call */
  usage?: TokenUsage;
  /** Raw LLM response for debugging/fallback parsing */
  rawResponse: string;
  /** Whether any issues were detected */
  hasIssues: boolean;
}

/**
 * Options for configuring the detection phase run.
 */
export interface DetectionPhaseOptions {
  /** Maximum number of retry attempts for LLM calls (default: 3) */
  maxRetries?: number;
}

/**
 * DetectionPhaseRunner runs the first phase of the two-phase evaluation architecture.
 *
 * This class is responsible for:
 * 1. Building the detection prompt with criteria from the PromptFile
 * 2. Calling the LLM using runPromptUnstructured for free-form text response
 * 3. Returning the raw response and structured detection result
 *
 * The actual parsing of the markdown response into structured issues
 * is handled by a separate DetectionResponseParser (to be implemented).
 *
 * @example
 * ```ts
 * const runner = new DetectionPhaseRunner(llmProvider);
 * const result = await runner.run(content, criteria);
 * console.log(`Found ${result.issues.length} issues`);
 * ```
 */
export class DetectionPhaseRunner {
  constructor(private readonly llmProvider: LLMProvider) {}

  /**
   * Run the detection phase on the provided content.
   *
   * @param content - The content to analyze for issues
   * @param criteria - The evaluation criteria to check against
   * @param options - Optional configuration for the detection run
   * @returns Promise resolving to DetectionResult with issues and metadata
   */
  async run(
    content: string,
    criteria: string,
    options: DetectionPhaseOptions = {}
  ): Promise<DetectionResult> {
    const { maxRetries = 3 } = options;

    // Build the detection prompt with criteria
    const prompt = this.buildPrompt(criteria);

    // Run LLM call with retry logic for transient failures
    const { data: llmResult } = await withRetry(
      () => this.llmProvider.runPromptUnstructured(content, prompt),
      { maxRetries, context: "detection phase" }
    );

    const rawResponse = llmResult.data;
    const usage = llmResult.usage;

    // Parse the raw response into structured issues
    const issues = this.parseResponse(rawResponse);

    const result: DetectionResult = {
      issues,
      rawResponse,
      hasIssues: issues.length > 0,
    };

    if (usage) {
      result.usage = usage;
    }

    return result;
  }

  /**
   * Build the detection prompt by inserting criteria into the template.
   *
   * @param criteria - The evaluation criteria to insert
   * @returns The complete prompt text for the detection phase
   */
  private buildPrompt(criteria: string): string {
    const template = getPrompt("detection-phase");
    return template.replace("{criteria}", criteria);
  }

  /**
   * Parse the raw markdown response from the LLM into structured issues.
   *
   * This is a lightweight parser that extracts the basic issue structure.
   * A more robust DetectionResponseParser will be implemented separately.
   *
   * @param rawResponse - The raw text response from the LLM
   * @returns Array of parsed RawDetectionIssue objects
   */
  private parseResponse(rawResponse: string): RawDetectionIssue[] {
    const issues: RawDetectionIssue[] = [];

    // Check for "No issues found" response
    if (rawResponse.toLowerCase().includes("no issues found")) {
      return issues;
    }

    // Split by "## Issue " to find individual issue sections
    const sections = rawResponse.split(/## Issue \d+/i);

    // Skip the first element (intro text before "## Issue 1")
    for (const section of sections.slice(1)) {
      const issue = this.parseIssueSection(section);
      if (issue) {
        issues.push(issue);
      }
    }

    return issues;
  }

  /**
   * Parse a single issue section into a RawDetectionIssue.
   *
   * @param section - The markdown section for a single issue
   * @returns Parsed RawDetectionIssue or null if parsing fails
   */
  private parseIssueSection(section: string): RawDetectionIssue | null {
    try {
      const issue: Partial<RawDetectionIssue> = {};

      // Extract quotedText from **quotedText:** block
      const quotedTextMatch = section.match(/\*\*quotedText:\*\*\s*\n\s*>?\s*(.+?)(?=\n\s*\*\*|\n\s*$)/s);
      if (quotedTextMatch?.[1]) {
        issue.quotedText = quotedTextMatch[1].trim();
      }

      // Extract contextBefore
      const contextBeforeMatch = section.match(/\*\*contextBefore:\*\*\s*\n(.+?)(?=\n\s*\*\*|\n\s*$)/s);
      if (contextBeforeMatch?.[1]) {
        issue.contextBefore = contextBeforeMatch[1].trim();
      }

      // Extract contextAfter
      const contextAfterMatch = section.match(/\*\*contextAfter:\*\*\s*\n(.+?)(?=\n\s*\*\*|\n\s*$)/s);
      if (contextAfterMatch?.[1]) {
        issue.contextAfter = contextAfterMatch[1].trim();
      }

      // Extract line number
      const lineMatch = section.match(/\*\*line:\*\*\s*(\d+)/);
      if (lineMatch?.[1]) {
        issue.line = parseInt(lineMatch[1], 10);
      }

      // Extract criterionName
      const criterionNameMatch = section.match(/\*\*criterionName:\*\*\s*(.+?)(?=\n|\r|$)/);
      if (criterionNameMatch?.[1]) {
        issue.criterionName = criterionNameMatch[1].trim();
      }

      // Extract analysis - matches everything until the next ## or end of content
      const analysisMatch = section.match(/\*\*analysis:\*\*\s*\n(.+?)(?=\n\s*##|$)/s);
      if (analysisMatch?.[1]) {
        issue.analysis = analysisMatch[1].trim();
      }

      // Validate required fields
      if (
        issue.quotedText &&
        issue.line &&
        issue.criterionName &&
        issue.analysis
      ) {
        return {
          quotedText: issue.quotedText,
          contextBefore: issue.contextBefore ?? "",
          contextAfter: issue.contextAfter ?? "",
          line: issue.line,
          criterionName: issue.criterionName,
          analysis: issue.analysis,
        };
      }

      return null;
    } catch {
      // Gracefully handle malformed sections
      return null;
    }
  }
}
