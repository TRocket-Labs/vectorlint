import { readFileSync } from 'fs';
import { LLMProvider } from '../../providers/llm-provider';
import { ValeRunner } from './vale-runner';
import { SuggestionGenerator } from './suggestion-generator';
import { 
  ValeAIResult, 
  ValeFinding, 
  Context, 
  ValeAIConfig 
} from './types';
import { ValeOutput } from '../../schemas/vale-responses';

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
    this.fileContentCache.clear();
    
    const valeOutput: ValeOutput = await this.valeRunner.run(files);
    
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
        let context: Context;
        try {
          context = this.extractContextWindow(
            content,
            issue.Line,
            issue.Span,
            this.config.contextWindowSize
          );
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          console.warn(`[vale-ai] Warning: Failed to extract context for ${filename}:${issue.Line}: ${errorMsg}`);
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
          description: issue.Description || issue.Message || 'No description available',
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
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.warn(`[vale-ai] Warning: Failed to generate AI suggestions: ${errorMsg}`);
      // Use Vale's original descriptions as fallback
      suggestions = new Map();
      for (const finding of findings) {
        suggestions.set(finding, finding.description);
      }
    }
    
    // Apply AI suggestions to findings
    for (const finding of findings) {
      const suggestion = suggestions.get(finding);
      if (suggestion) {
        finding.suggestion = suggestion;
      }
    }
    
    return { findings };
  }

  private cacheFileContent(filename: string): void {
    if (this.fileContentCache.has(filename)) {
      return;
    }
    
    try {
      const content = readFileSync(filename, 'utf-8');
      this.fileContentCache.set(filename, content);
    } catch (e: unknown) {
      const err = e instanceof Error ? e : new Error(String(e));
      console.warn(`[vale-ai] Warning: Failed to read file ${filename}: ${err.message}`);
      // Store empty string to avoid repeated read attempts
      this.fileContentCache.set(filename, '');
    }
  }

  /**
   * Extract context window around a Vale finding
   * 
   * Uses character-based windows (not line-based) to provide consistent context
   * regardless of line length. This ensures AI suggestion generators receive
   * enough surrounding text to understand the issue context.
   * 
   * @param content Full file content
   * @param line Line number (1-indexed from Vale)
   * @param span Column span [start, end] (1-indexed from Vale)
   * @param windowSize Number of characters before/after the match
   * @returns Context object with before and after text
   */
  private extractContextWindow(
    content: string,
    line: number,
    span: [number, number],
    windowSize: number
  ): Context {
    try {
      const lines = content.split('\n');

      if (line < 1 || line > lines.length) {
        console.warn(`[vale-ai] Warning: Line ${line} out of range (1-${lines.length})`);
        return { before: '', after: '' };
      }
      
      // Calculate character position of the line start
      // Lines array is validated above, so we know indices are safe
      let charPosition = 0;
      for (let i = 0; i < line - 1; i++) {
        charPosition += (lines[i]?.length ?? 0) + 1; // +1 for newline
      }
      
      // Add span[0] to get exact match position (span is 1-indexed)
      const matchPosition = charPosition + span[0] - 1;
      
      // Extract before context (bounded by file start)
      const beforeStart = Math.max(0, matchPosition - windowSize);
      const before = content.substring(beforeStart, matchPosition);
    
      const matchEnd = matchPosition + (span[1] - span[0]);
      
      const afterEnd = Math.min(content.length, matchEnd + windowSize);
      const after = content.substring(matchEnd, afterEnd);
      
      return { before, after };
    } catch (e: unknown) {
      const err = e instanceof Error ? e : new Error(String(e));
      console.warn(`[vale-ai] Warning: Failed to extract context: ${err.message}`);
      return { before: '', after: '' };
    }
  }

  /**
   * Normalize Vale severity to standard format
   * 
   * Converts Vale's severity strings to a consistent format,
   * defaulting to 'suggestion' for unknown values.
   * 
   * @param severity - Vale severity string (case-insensitive)
   * @returns Normalized severity: 'error', 'warning', or 'suggestion'
   */
  private normalizeSeverity(severity: string): 'error' | 'warning' | 'suggestion' {
    const lower = severity.toLowerCase();
    if (lower === 'error') return 'error';
    if (lower === 'warning') return 'warning';
    return 'suggestion';
  }
}
