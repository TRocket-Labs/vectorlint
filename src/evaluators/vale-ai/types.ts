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

// Vale CLI types are now imported from schemas/vale-responses.ts

export interface ValeAIConfig {
  contextWindowSize: number;
}

export interface BatchSuggestionResponse {
  suggestions: {
    findingIndex: number;
    suggestion: string;
  }[];
}

