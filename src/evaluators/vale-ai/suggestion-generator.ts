/**
 * SuggestionGenerator for AI-enhanced Vale suggestions
 * 
 * This module generates context-aware suggestions for Vale findings
 * by batching all findings into a single LLM request for efficiency.
 */

import { LLMProvider } from '../../providers/llm-provider';
import { ValeFinding, Context } from './types';

/**
 * Structured output schema for batch suggestion generation
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
 */
export class SuggestionGenerator {
  constructor(private llmProvider: LLMProvider) {}

  /**
   * Generate AI suggestions for a batch of Vale findings
   * 
   * @param findings - Array of Vale findings to generate suggestions for
   * @param contextWindows - Map of findings to their context windows
   * @returns Map of findings to their AI-generated suggestions
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
        '', // No separate content needed, prompt contains everything
        prompt,
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
   * @param findings - Array of Vale findings
   * @param contexts - Map of findings to their context windows
   * @returns Formatted prompt string
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
