/**
 * Vale AI type definitions and interfaces
 * 
 * This module defines the data structures for Vale CLI integration
 * and AI-enhanced suggestion generation.
 */

export interface ValeAIResult {
  findings: ValeFinding[];
}

/**
 * A single Vale finding with AI-enhanced suggestion
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
  /** Rule name (e.g., "write-good.Passive") */
  Check: string;
  Description: string;
  Line: number;
  /** Start and end column positions [start, end] */
  Span: [number, number];
  /** The matched text that triggered the rule */
  Match: string;
  /** Severity level: "error", "warning", or "suggestion" */
  Severity: string;
  /** Optional action for auto-fix */
  Action?: {
    Name: string;
    Params: string[];
  };
}

/**
 * Configuration for Vale AI evaluator
 */
export interface ValeAIConfig {
  contextWindowSize: number;
}
