/**
 * ValeAIEvaluator - Orchestrates Vale execution and AI enhancement
 * 
 * This class coordinates:
 * - Running Vale CLI via ValeRunner
 * - Extracting context windows around findings
 * - Generating AI suggestions via SuggestionGenerator
 * - Transforming results to ValeAIResult format
 */

import { readFileSync } from 'fs';
import { LLMProvider } from '../../providers/llm-provider.js';
import { ValeRunner } from './vale-runner.js';
import { SuggestionGenerator } from './suggestion-generator.js';
import { 
  ValeAIResult, 
  ValeFinding, 
  ValeOutput, 
  Context, 
  ValeAIConfig 
} from './types.js';

export class ValeAIEvaluator {
  private fileContentCache: Map<string, string> = new Map();
  private suggestionGenerator: SuggestionGenerator;
  
  constructor(
    private llmProvider: LLMProvider,
    private valeRunner: ValeRunner,
    private config: ValeAIConfig
  ) {
    this.suggestionGenerator = new SuggestionGenerator(llmProvider);
  }

  /**
   * Evaluate files using Vale CLI with AI-enhanced suggestions
   * @param files Optional array of file paths. If not provided, Vale uses its own discovery
   * @returns ValeAIResult with findings and AI suggestions
   */
  async evaluate(files?: string[]): Promise<ValeAIResult> {
    // Clear cache for fresh evaluation
    this.fileContentCache.clear();
    
    let valeOutput: ValeOutput;
    try {
      valeOutput = await this.valeRunner.run(files);
    } catch (error) {
      throw error;
    }
    
    if (Object.keys(valeOutput).length === 0) {
      return { findings: [] };
    }
    
    for (const filename of Object.keys(valeOutput)) {
      this.cacheFileContent(filename);
    }
    
    // Extract context windows for each finding
    const contextWindows = new Map<ValeFinding, Context>();
    const findings: ValeFinding[] = [];
    
    for (const [filename, issues] of Object.entries(valeOutput)) {
      const content = this.fileContentCache.get(filename);
      if (!content) {
        console.warn(`[vale-ai] Warning: Could not read file ${filename}, skipping context extraction`);
        continue;
      }
      
      for (const issue of issues) {
        // Extract context window with error handling
        let context: Context;
        try {
          context = this.extractContextWindow(
            content,
            issue.Line,
            issue.Span,
            this.config.contextWindowSize
          );
        } catch (error) {
          console.warn(`[vale-ai] Warning: Failed to extract context for ${filename}:${issue.Line}: ${error}`);
          context = { before: '', after: '' };
        }
        
        // Create preliminary finding (without AI suggestion yet)
        const finding: ValeFinding = {
          file: filename,
          line: issue.Line,
          column: issue.Span[0],
          severity: this.normalizeSeverity(issue.Severity),
          rule: issue.Check,
          match: issue.Match,
          description: issue.Description,
          suggestion: '', // Will be filled by AI
          context
        };
        
        findings.push(finding);
        contextWindows.set(finding, context);
      }
    }
    
    // Generate AI suggestions in batch
    let suggestions: Map<ValeFinding, string>;
    try {
      suggestions = await this.suggestionGenerator.generateBatch(findings, contextWindows);
    } catch (error) {
      console.warn(`[vale-ai] Warning: Failed to generate AI suggestions: ${error}`);
      // Use Vale's original descriptions as fallback
      suggestions = new Map();
      for (const finding of findings) {
        suggestions.set(finding, finding.description);
      }
    }
    
    // Transform to ValeAIResult with AI suggestions
    return this.transformToValeAIResult(valeOutput, suggestions, contextWindows);
  }

  /**
   * Transform Vale output and AI suggestions to ValeAIResult
   * @param valeOutput Raw Vale CLI output
   * @param suggestions Map of findings to AI suggestions
   * @param contextWindows Map of findings to context windows
   * @returns ValeAIResult with all findings and suggestions
   */
  private transformToValeAIResult(
    valeOutput: ValeOutput,
    suggestions: Map<ValeFinding, string>,
    contextWindows: Map<ValeFinding, Context>
  ): ValeAIResult {
    const findings: ValeFinding[] = [];
    
    // Flatten ValeOutput (file → issues) to array of ValeFinding objects
    for (const [filename, issues] of Object.entries(valeOutput)) {
      for (const issue of issues) {
        // Find the corresponding finding in our suggestions map
        // We need to create a matching finding to look it up
        const matchingFinding = Array.from(suggestions.keys()).find(
          f => f.file === filename && 
               f.line === issue.Line && 
               f.column === issue.Span[0] &&
               f.rule === issue.Check
        );
        
        if (!matchingFinding) {
          // This shouldn't happen, but handle gracefully
          console.warn(`[vale-ai] Warning: Could not find suggestion for ${filename}:${issue.Line}`);
          continue;
        }
        
        // Get AI suggestion (or Vale's description as fallback)
        const suggestion = suggestions.get(matchingFinding) ?? issue.Description;
        
        // Get context window
        const context = contextWindows.get(matchingFinding) ?? { before: '', after: '' };
        
        // Create final ValeFinding with all data
        const finding: ValeFinding = {
          file: filename,
          line: issue.Line,
          column: issue.Span[0],
          severity: this.normalizeSeverity(issue.Severity),
          rule: issue.Check,
          match: issue.Match,
          description: issue.Description,
          suggestion,
          context
        };
        
        findings.push(finding);
      }
    }
    
    return { findings };
  }

  /**
   * Read and cache file content
   * @param filename Path to file
   */
  private cacheFileContent(filename: string): void {
    if (this.fileContentCache.has(filename)) {
      return;
    }
    
    try {
      const content = readFileSync(filename, 'utf-8');
      this.fileContentCache.set(filename, content);
    } catch (error) {
      console.warn(`[vale-ai] Warning: Failed to read file ${filename}: ${error}`);
      // Store empty string to avoid repeated read attempts
      this.fileContentCache.set(filename, '');
    }
  }

  /**
   * Extract context window around a Vale finding
   * @param content Full file content
   * @param line Line number (1-indexed)
   * @param span Column span [start, end] (1-indexed)
   * @param windowSize Number of characters to extract before and after
   * @returns Context object with before and after text
   */
  private extractContextWindow(
    content: string,
    line: number,
    span: [number, number],
    windowSize: number
  ): Context {
    try {
      // Convert line number to character position
      const lines = content.split('\n');
      
      // Validate line number
      if (line < 1 || line > lines.length) {
        console.warn(`[vale-ai] Warning: Line ${line} out of range (1-${lines.length})`);
        return { before: '', after: '' };
      }
      
      // Calculate character position of the line start
      let charPosition = 0;
      for (let i = 0; i < line - 1; i++) {
        charPosition += (lines[i]?.length ?? 0) + 1; // +1 for newline
      }
      
      // Add span[0] to get exact match position (span is 1-indexed)
      const matchPosition = charPosition + span[0] - 1;
      
      // Extract before context (bounded by file start)
      const beforeStart = Math.max(0, matchPosition - windowSize);
      const before = content.substring(beforeStart, matchPosition);
      
      // Calculate match end position
      const matchEnd = matchPosition + (span[1] - span[0]);
      
      // Extract after context (bounded by file end)
      const afterEnd = Math.min(content.length, matchEnd + windowSize);
      const after = content.substring(matchEnd, afterEnd);
      
      return { before, after };
    } catch (error) {
      console.warn(`[vale-ai] Warning: Failed to extract context: ${error}`);
      return { before: '', after: '' };
    }
  }

  /**
   * Normalize Vale severity to standard format
   * @param severity Vale severity string
   * @returns Normalized severity
   */
  private normalizeSeverity(severity: string): 'error' | 'warning' | 'suggestion' {
    const lower = severity.toLowerCase();
    if (lower === 'error') return 'error';
    if (lower === 'warning') return 'warning';
    return 'suggestion';
  }
}
