import { LLMProvider } from '../../providers/llm-provider';
import { ValeFinding, Context } from './types';

/**
 * Structured output schema for batch suggestion generation
 * 
 * The LLM returns an array of suggestions, each with:
 * - findingIndex: Zero-based index matching the input findings array
 * - suggestion: Context-aware explanation and fix recommendation
 */
interface BatchSuggestionResponse {
  suggestions: {
    findingIndex: number;
    suggestion: string;
  }[];
}

/**
 * JSON Schema for batch suggestion structured output
 */
const BATCH_SUGGESTION_SCHEMA = {
  name: 'batch_suggestions',
  schema: {
    type: 'object',
    properties: {
      suggestions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            findingIndex: {
              type: 'number',
              description: 'Zero-based index of the finding this suggestion is for',
            },
            suggestion: {
              type: 'string',
              description: 'Context-aware explanation and fix recommendation',
            },
          },
          required: ['findingIndex', 'suggestion'],
          additionalProperties: false,
        },
      },
    },
    required: ['suggestions'],
    additionalProperties: false,
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
   *
   */
  async generateBatch(
    findings: ValeFinding[],
    contextWindows: Map<ValeFinding, Context>
  ): Promise<Map<ValeFinding, string>> {
    if (findings.length === 0) {
      return new Map();
    }

    const prompt = this.buildBatchPrompt(findings, contextWindows);
    const resultMap = new Map<ValeFinding, string>();

    try {
      // Call LLM with structured output schema
      const response = await this.llmProvider.runPromptStructured<BatchSuggestionResponse>(
        prompt, // The findings data as content
        `You are a writing improvement assistant. For each Vale finding in the input, provide a context-aware suggestion explaining why it's an issue and how to fix it. Be specific and actionable.

Important guidelines:
- For spelling issues: If the word appears to be spelled correctly (like "APIs" or "JMeter"), suggest adding it to a dictionary or explain that it's a technical term
- For grammar issues: Explain the specific problem and provide a concrete fix
- For style issues: Explain why the current phrasing could be improved and suggest alternatives
- Always consider the context around the flagged text`,
        BATCH_SUGGESTION_SCHEMA
      );

      // Map suggestions back to findings by index
      if (response.suggestions && Array.isArray(response.suggestions)) {
        for (const item of response.suggestions) {
          const finding = findings[item.findingIndex];
          if (finding && item.suggestion) {
            resultMap.set(finding, item.suggestion);
          }
        }
      }

      // For any findings without suggestions, use Vale's original description
      for (const finding of findings) {
        if (!resultMap.has(finding)) {
          resultMap.set(finding, finding.description);
        }
      }
    } catch (error) {
      // On LLM failure, use Vale's original descriptions for all findings
      console.warn('[vale-ai] Failed to generate AI suggestions:', error);
      for (const finding of findings) {
        resultMap.set(finding, finding.description);
      }
    }

    return resultMap;
  }

  /**
   * Build a batch prompt for multiple Vale findings
   * 
   * Creates a structured prompt that includes:
   * - Instructions for the LLM
   * - Numbered findings (for reference in structured output)
   * - Rule name, matched text, and context for each finding
   * - Vale's original description
   * 
   * @param findings - Array of Vale findings
   * @param contexts - Map of findings to their context windows
   * @returns Formatted prompt string with all findings
   * 
   */
  private buildBatchPrompt(
    findings: ValeFinding[],
    contexts: Map<ValeFinding, Context>
  ): string {
    const promptParts = [
      'You are a writing improvement assistant. For each Vale finding below,',
      'provide a context-aware suggestion explaining why it\'s an issue and',
      'how to fix it. Be specific and actionable.\n',
    ];

    findings.forEach((finding, index) => {
      const context = contexts.get(finding);
      
      promptParts.push(`Finding ${index}:`);
      promptParts.push(`Rule: ${finding.rule}`);
      promptParts.push(`Match: '${finding.match}'`);
      
      if (context) {
        const contextPreview = `${context.before}${finding.match}${context.after}`;
        promptParts.push(`Context: '${contextPreview}'`);
      }
      
      promptParts.push(`Vale says: '${finding.description}'`);
      promptParts.push(''); // Blank line between findings
    });

    return promptParts.join('\n');
  }
}
