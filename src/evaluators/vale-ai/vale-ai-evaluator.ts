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


  async evaluate(files?: string[]): Promise<ValeAIResult> {
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
   * 
   * Flattens Vale's file-grouped output into a single array of findings,
   * combining Vale's rule-based data with AI suggestions and context windows.
   * 
   * @param valeOutput - Raw Vale CLI output (filename → issues)
   * @param suggestions - Map of findings to AI-generated suggestions
   * @param contextWindows - Map of findings to context windows
   * @returns ValeAIResult with all findings, suggestions, and context
   */
  private transformToValeAIResult(
    valeOutput: ValeOutput,
    suggestions: Map<ValeFinding, string>,
    contextWindows: Map<ValeFinding, Context>
  ): ValeAIResult {
    const findings: ValeFinding[] = [];
    
    for (const [filename, issues] of Object.entries(valeOutput)) {
      for (const issue of issues) {
        const matchingFinding = Array.from(suggestions.keys()).find(
          f => f.file === filename && 
               f.line === issue.Line && 
               f.column === issue.Span[0] &&
               f.rule === issue.Check
        );
        
        if (!matchingFinding) {
          console.warn(`[vale-ai] Warning: Could not find suggestion for ${filename}:${issue.Line}`);
          continue;
        }
        
        const suggestion = suggestions.get(matchingFinding) ?? issue.Description;
        
        const context = contextWindows.get(matchingFinding) ?? { before: '', after: '' };
        
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
   * 
   * Reads a file once and stores it in the cache to avoid repeated
   * file system access when extracting context for multiple findings
   * in the same file.
   * 
   * Error handling: If file read fails, stores empty string and logs warning.
   * 
   * @param filename - Path to file to read and cache
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
      this.fileContentCache.set(filename, '');
    }
  }

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
    } catch (error) {
      console.warn(`[vale-ai] Warning: Failed to extract context: ${error}`);
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
