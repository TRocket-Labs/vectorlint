import { z } from 'zod';
import { LLMProvider } from '../../providers/llm-provider';
import { ValeFinding, Context } from './types';
import { loadPrompts, type PromptFile } from '../../prompts/prompt-loader';
import { buildCriteriaJsonSchema, CriteriaResult } from '../../prompts/schema';

/*
 * Schema for validating LLM responses at the boundary.
 * All external data (including LLM outputs) must be validated before use.
 */
const CRITERIA_RESULT_SCHEMA = z.object({
  criteria: z.array(
    z.object({
      name: z.string(),
      weight: z.number(),
      score: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
      summary: z.string(),
      reasoning: z.string(),
      violations: z.array(
        z.object({
          pre: z.string(),
          post: z.string(),
          analysis: z.string(),
          suggestion: z.string(),
        })
      ),
    })
  ),
});

export class SuggestionGenerator {
  private promptsPath: string;
  private valePrompt: PromptFile | null = null;

  constructor(
    private llmProvider: LLMProvider,
    promptsPath: string = 'prompts'
  ) {
    this.promptsPath = promptsPath;
  }

  /**
   * Generate AI suggestions for a batch of Vale findings using VectorLint prompts
   * 
   * Batching strategy: All findings processed in single LLM request for efficiency.
   * Same total tokens as individual requests, but 1 API call vs N calls.
   * 
   * Uses 1-based indexing for findings to match natural language references in LLM output.
   * Format designed to enable LLM to reference specific findings in structured violations.
   * 
   * Error handling:
   * - LLM failures: Falls back to Vale's original descriptions
   * - Validation errors: Logs warning, uses Vale descriptions
   * - Missing suggestions: Uses Vale's description for that finding
   * - Malformed responses: Parses available suggestions, uses fallbacks for rest
   * 
   * @param findings - Array of Vale findings to generate suggestions for
   * @param contextWindows - Map of findings to their context windows
   * @returns Map of findings to their AI-generated suggestions (never empty)
   */
  async generateBatch(
    findings: ValeFinding[],
    contextWindows: Map<ValeFinding, Context>
  ): Promise<Map<ValeFinding, string>> {
    if (findings.length === 0) {
      return new Map();
    }

    const resultMap = new Map<ValeFinding, string>();

    try {
      if (!this.valePrompt) {
        const { prompts } = loadPrompts(this.promptsPath);
        this.valePrompt = prompts.find(p => p.filename === 'vale-suggestion-generator.md') || null;
        
        if (!this.valePrompt) {
          throw new Error('vale-suggestion-generator.md prompt not found');
        }
      }

      const content = this.buildBatchContent(findings, contextWindows);

      const rawResponse = await this.llmProvider.runPromptStructured<CriteriaResult>(
        content,
        this.valePrompt.body,
        buildCriteriaJsonSchema()
      );

      /*
       * Boundary validation: All external data (including LLM responses) must be validated.
       * LLM outputs can be malformed, missing fields, or have unexpected types.
       */
      const response = CRITERIA_RESULT_SCHEMA.parse(rawResponse);

      this.extractSuggestionsFromCriteria(findings, response, resultMap);

      // Fallback for any findings without suggestions
      for (const finding of findings) {
        if (!resultMap.has(finding)) {
          resultMap.set(finding, finding.description);
        }
      }
    } catch (error) {
      console.warn('[vale-ai] Failed to generate AI suggestions:', error);
      // Graceful degradation: Use Vale's original descriptions
      for (const finding of findings) {
        resultMap.set(finding, finding.description);
      }
    }

    return resultMap;
  }

  /**
   * Build content for VectorLint evaluation containing all Vale findings
   * 
   * Format uses 1-based indexing (Finding 1, Finding 2, ...) to match natural language
   * references in LLM output. This enables the LLM to reference specific findings in
   * structured violation output using "Finding N:" prefix.
   * 
   * Each finding includes:
   * - Rule name and severity for context
   * - Matched text that triggered the rule
   * - Context window (text before/after) for context-aware suggestions
   * - Vale's original description as baseline
   * - Location for reference
   * 
   * @param findings - Array of Vale findings
   * @param contexts - Map of findings to their context windows
   * @returns Formatted content string for VectorLint evaluation
   */
  private buildBatchContent(
    findings: ValeFinding[],
    contexts: Map<ValeFinding, Context>
  ): string {
    const contentParts = [
      'Vale Findings for Suggestion Generation:\n',
    ];

    findings.forEach((finding, index) => {
      const context = contexts.get(finding);
      
      // Use 1-based indexing to match natural language references
      const findingNumber = index + 1;
      
      contentParts.push(`Finding ${findingNumber}:`);
      contentParts.push(`Rule: ${finding.rule}`);
      contentParts.push(`Match: "${finding.match}"`);
      
      if (context) {
        const contextPreview = `${context.before}${finding.match}${context.after}`;
        contentParts.push(`Context: "${contextPreview}"`);
      }
      
      contentParts.push(`Vale says: "${finding.description}"`);
      contentParts.push(''); // Blank line between findings
    });

    return contentParts.join('\n');
  }

  /**
   * Extract suggestions from VectorLint criteria results
   * 
   * Maps LLM-generated suggestions back to Vale findings using "Finding N:" references
   * in violation.pre field. Uses 1-based indexing to match buildBatchContent format.
   * 
   * Fallback strategy:
   * 1. Use violation.suggestion if present
   * 2. Combine violation.analysis + suggestion if suggestion is empty
   * 3. Use criterion.summary if no violations match
   * 4. Caller will use Vale's description if no suggestion found
   * 
   * @param findings - Original array of Vale findings (0-indexed)
   * @param criteriaResult - VectorLint evaluation result (validated)
   * @param resultMap - Map to populate with finding -> suggestion mappings
   */
  private extractSuggestionsFromCriteria(
    findings: ValeFinding[],
    criteriaResult: CriteriaResult,
    resultMap: Map<ValeFinding, string>
  ): void {
    // Process violations from all criteria to extract suggestions
    for (const criterion of criteriaResult.criteria) {
      for (const violation of criterion.violations) {
        /*
         * Match violation to finding using "Finding N:" reference in pre field.
         * Uses 1-based indexing (Finding 1, Finding 2, ...) to match natural language.
         * Convert to 0-based index for array access.
         */
        const findingMatch = violation.pre.match(/Finding (\d+):/);
        if (findingMatch && findingMatch[1]) {
          const findingNumber = parseInt(findingMatch[1], 10);
          const findingIndex = findingNumber - 1; // Convert 1-based to 0-based
          const finding = findings[findingIndex];
          
          if (finding && !resultMap.has(finding)) {
            // Prefer violation.suggestion, fallback to analysis + suggestion, then summary
            const suggestion = violation.suggestion || 
              `${violation.analysis} ${violation.suggestion}`.trim() ||
              criterion.summary;
            
            resultMap.set(finding, suggestion);
          }
        }
      }

      /*
       * Fallback: If criterion has no violations but has summary, apply to first unmatched finding.
       * This handles cases where LLM provides general guidance without specific violations.
       */
      if (criterion.violations.length === 0 && criterion.summary) {
        for (const finding of findings) {
          if (!resultMap.has(finding)) {
            resultMap.set(finding, criterion.summary);
            break; // Only apply to first unmatched finding to avoid duplicates
          }
        }
      }
    }
  }
}