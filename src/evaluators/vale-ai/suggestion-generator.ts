import { LLMProvider } from '../../providers/llm-provider';
import { ValeFinding, Context } from './types';
import { loadPrompts, type PromptFile } from '../../prompts/prompt-loader';
import { buildCriteriaJsonSchema, CriteriaResult } from '../../prompts/schema';

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
   * Uses the vale-suggestion-generator.md prompt to evaluate findings and generate
   * context-aware suggestions through the VectorLint criteria system.
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
      if (!this.valePrompt) {
        const { prompts } = loadPrompts(this.promptsPath);
        this.valePrompt = prompts.find(p => p.filename === 'vale-suggestion-generator.md') || null;
        
        if (!this.valePrompt) {
          throw new Error('vale-suggestion-generator.md prompt not found');
        }
      }

      const content = this.buildBatchContent(findings, contextWindows);

      const response = await this.llmProvider.runPromptStructured<CriteriaResult>(
        content,
        this.valePrompt.body,
        buildCriteriaJsonSchema()
      );

      this.extractSuggestionsFromCriteria(findings, response, resultMap);

      for (const finding of findings) {
        if (!resultMap.has(finding)) {
          resultMap.set(finding, finding.description);
        }
      }
    } catch (error) {
      console.warn('[vale-ai] Failed to generate AI suggestions:', error);
      for (const finding of findings) {
        resultMap.set(finding, finding.description);
      }
    }

    return resultMap;
  }

  /**
   * Build content for VectorLint evaluation containing all Vale findings
   * 
   * Creates structured content that the VectorLint prompt can evaluate:
   * - Numbered findings for reference
   * - Rule name, matched text, and context for each finding
   * - Vale's original description
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
      
      contentParts.push(`Finding ${index}:`);
      contentParts.push(`Rule: ${finding.rule}`);
      contentParts.push(`Severity: ${finding.severity}`);
      contentParts.push(`Match: "${finding.match}"`);
      
      if (context) {
        const contextPreview = `${context.before}${finding.match}${context.after}`;
        contentParts.push(`Context: "${contextPreview}"`);
      }
      
      contentParts.push(`Vale Description: "${finding.description}"`);
      contentParts.push(`Location: ${finding.file}:${finding.line}:${finding.column}`);
      contentParts.push(''); // Blank line between findings
    });

    return contentParts.join('\n');
  }

  /**
   * Extract suggestions from VectorLint criteria results
   * 
   * Processes the structured criteria output to extract actionable suggestions
   * for each Vale finding. Maps suggestions back to findings using the index.
   * 
   * @param findings - Original array of Vale findings
   * @param criteriaResult - VectorLint evaluation result
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
        // Try to match violation to a finding by looking for finding index in the violation text
        const findingMatch = violation.pre.match(/Finding (\d+):/);
        if (findingMatch && findingMatch[1]) {
          const findingIndex = parseInt(findingMatch[1], 10);
          const finding = findings[findingIndex];
          
          if (finding && !resultMap.has(finding)) {
            const suggestion = violation.suggestion || 
              `${violation.analysis} ${violation.suggestion}`.trim() ||
              criterion.summary;
            
            resultMap.set(finding, suggestion);
          }
        }
      }

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