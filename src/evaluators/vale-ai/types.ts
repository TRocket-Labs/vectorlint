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

export interface ValeOutput {
  [filename: string]: ValeIssue[];
}


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
