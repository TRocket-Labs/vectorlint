import { readFileSync } from 'fs';
import { ValeRunner } from './vale-runner.js';
import { 
  ValeAIResult, 
  ValeFinding, 
  ValeOutput, 
  ValeIssue, 
  Context, 
  ValeAIConfig 
} from './types.js';

export class ValeAIEvaluator {
  private fileContentCache: Map<string, string> = new Map();
  
  constructor(
    private valeRunner: ValeRunner,
    private config: ValeAIConfig
  ) {}

  /**
   * Evaluate files using Vale CLI
   * @param files Optional array of file paths. If not provided, Vale uses its own discovery
   * @returns ValeAIResult with findings and AI suggestions
   */
  async evaluate(files?: string[]): Promise<ValeAIResult> {
    this.fileContentCache.clear();
    
    const valeOutput = await this.valeRunner.run(files);
    
    if (Object.keys(valeOutput).length === 0) {
      return { findings: [] };
    }
    
    for (const filename of Object.keys(valeOutput)) {
      this.cacheFileContent(filename);
    }
    
    const findings: ValeFinding[] = [];
    
    for (const [filename, issues] of Object.entries(valeOutput)) {
      const content = this.fileContentCache.get(filename);
      if (!content) {
        console.warn(`[vale-ai] Warning: Could not read file ${filename}, skipping context extraction`);
        continue;
      }
      
      for (const issue of issues) {
        const context = this.extractContextWindow(
          content,
          issue.Line,
          issue.Span,
          this.config.contextWindowSize
        );
        
        // Transform to ValeFinding (without AI suggestion for now)
        const finding: ValeFinding = {
          file: filename,
          line: issue.Line,
          column: issue.Span[0],
          severity: this.normalizeSeverity(issue.Severity),
          rule: issue.Check,
          match: issue.Match,
          description: issue.Description,
          suggestion: '', // Will be filled by SuggestionGenerator in later task
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
    
      const matchPosition = charPosition + span[0] - 1;
      
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
