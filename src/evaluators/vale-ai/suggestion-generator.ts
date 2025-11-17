import { z } from 'zod';
import { LLMProvider } from '../../providers/llm-provider';
import { ValeFinding, Context } from './types';

/*
 * Schema for validating LLM responses at the boundary.
 * All external data (including LLM outputs) must be validated before use.
 */
const SUGGESTION_RESPONSE_SCHEMA = z.object({
  suggestions: z.array(
    z.object({
      findingNumber: z.number(),
      suggestion: z.string(),
    })
  ),
});

type SuggestionResponse = z.infer<typeof SUGGESTION_RESPONSE_SCHEMA>;

const SYSTEM_PROMPT = `You are a writing improvement assistant. For each Vale linting finding, provide a specific, actionable suggestion that explains the issue and how to fix it.

Consider:
- The surrounding text context
- Technical terminology and domain-specific language
- Whether the finding is legitimate or a false positive
- Concrete, implementable fixes

For spelling issues with technical terms or acronyms, suggest adding to dictionary rather than changing.
For grammar issues, provide exact corrections.
For style issues, explain why and suggest specific alternatives.`;

const JSON_SCHEMA = {
  name: 'vale_suggestions',
  schema: {
    type: 'object',
    properties: {
      suggestions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            findingNumber: { type: 'number' },
            suggestion: { type: 'string' },
          },
          required: ['findingNumber', 'suggestion'],
        },
      },
    },
    required: ['suggestions'],
  },
};

/**
 * Generates AI-enhanced suggestions for Vale findings
 * 
 * This class uses an LLM to generate context-aware suggestions that
 * explain why each Vale finding is an issue and how to fix it.
 */
export class SuggestionGenerator {
  /**
   * Create a new SuggestionGenerator
   * 
   * @param llmProvider - LLM provider for generating suggestions
   */
  constructor(private llmProvider: LLMProvider) {}

  /**
   * Generate AI suggestions for a batch of Vale findings
   * 
   * Processes all findings in a single LLM request for efficiency.
   * Each finding is numbered and the LLM returns suggestions indexed
   * to match the input array.
   * 
   * Error handling:
   * - LLM failures: Falls back to Vale's original descriptions
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
      const userPrompt = this.buildBatchContent(findings, contextWindows);

      const rawResponse = await this.llmProvider.runPromptStructured<SuggestionResponse>(
        userPrompt,
        SYSTEM_PROMPT,
        JSON_SCHEMA
      );

      /*
       * Boundary validation: All external data (including LLM responses) must be validated.
       * LLM outputs can be malformed, missing fields, or have unexpected types.
       */
      const response = SUGGESTION_RESPONSE_SCHEMA.parse(rawResponse);

      // Map suggestions back to findings
      for (const { findingNumber, suggestion } of response.suggestions) {
        const findingIndex = findingNumber - 1; // Convert 1-based to 0-based
        const finding = findings[findingIndex];
        if (finding) {
          resultMap.set(finding, suggestion);
        }
      }

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
   * Build content for batch suggestion generation
   * 
   * Creates a structured prompt that includes:
   * - Instructions for the LLM
   * - Numbered findings (for reference in structured output)
   * - Rule name, matched text, and context for each finding
   * - Vale's original description
   * 
   * @param findings - Array of Vale findings
   * @param contexts - Map of findings to their context windows
   * @returns Formatted content string for LLM evaluation
   */
  private buildBatchContent(
    findings: ValeFinding[],
    contexts: Map<ValeFinding, Context>
  ): string {
    const contentParts = ['Provide specific, actionable suggestions for these Vale findings:\n'];

    findings.forEach((finding, index) => {
      const context = contexts.get(finding);
      const findingNumber = index + 1;
      
      contentParts.push(`Finding ${findingNumber}:`);
      contentParts.push(`Rule: ${finding.rule}`);
      contentParts.push(`Match: "${finding.match}"`);
      
      if (context) {
        const contextPreview = `${context.before}${finding.match}${context.after}`;
        contentParts.push(`Context: "${contextPreview}"`);
      }
      
      contentParts.push(`Vale says: "${finding.description}"`);
      contentParts.push('');
    });

    return contentParts.join('\n');
  }
}