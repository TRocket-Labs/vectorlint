export interface ValeAIResult {
  findings: ValeFinding[];
}

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

export interface BatchSuggestionResponse {
  suggestions: {
    findingIndex: number;
    suggestion: string;
  }[];
}

