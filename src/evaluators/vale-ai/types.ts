/**
 * Result from Vale AI evaluation
 * 
 * Contains all findings with AI-enhanced suggestions and context windows.
 */
export interface ValeAIResult {
  findings: ValeFinding[];
}

/**
 * A single Vale finding with AI-enhanced suggestion
 * 
 * Combines Vale's rule-based finding with:
 * - AI-generated context-aware suggestion
 * - Context window (text before/after the issue)
 */
export interface ValeFinding {
  file: string;
  line: number;
  column: number;
  severity: 'error' | 'warning' | 'suggestion';
  rule: string;
  match: string;
  description: string;
  suggestion: string;
  context: Context;
}

/**
 * Context window containing text before and after an issue
 * 
 * Used to provide surrounding text to the LLM for generating
 * context-aware suggestions. The window size is configurable
 * via ValeAIConfig.contextWindowSize.
 */
export interface Context {
  before: string;
  after: string;
}

/**
 * Vale CLI JSON output structure
 * Maps filename to array of issues found in that file
 */
export interface ValeOutput {
  [filename: string]: ValeIssue[];
}

/**
 * A single issue from Vale CLI JSON output
 * Field names match Vale's JSON format exactly
 */
export interface ValeIssue {
  Check: string;
  Description: string;
  Message: string;
  Line: number;
  Span: [number, number];
  Match: string;
  Severity: string;
  Link?: string;
  Action?: {
    Name: string;
    Params: string[];
  };
}

export interface ValeAIConfig {
  contextWindowSize: number;
}
