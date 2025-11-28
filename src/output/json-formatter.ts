import type { ValeOutput, ValeIssue } from '../schemas/vale-responses';

export interface JsonIssue {
  file: string;
  line: number;
  column: number;
  severity: 'error' | 'warning' | 'info';
  message: string;
  rule: string;
  match: string;
  matchLength?: number; // Length of the matched text for span calculation
  suggestion?: string | undefined;
  score?: string | undefined;
}

export interface JsonResult {
  files: Record<string, ValeIssue[]>;
  summary: {
    files: number;
    errors: number;
    warnings: number;
    suggestions: number;
  };
}

export interface RdJsonResult {
  source: {
    name: string;
    url: string;
  };
  diagnostics: RdJsonDiagnostic[];
}

export interface RdJsonDiagnostic {
  message: string;
  location: {
    path: string;
    range: {
      start: {
        line: number;
        column: number;
      };
      end?: {
        line: number;
        column: number;
      };
    };
  };
  severity: 'ERROR' | 'WARNING' | 'INFO';
  code?: {
    value: string;
    url?: string;
  };
  suggestions?: RdJsonSuggestion[];
}

export interface RdJsonSuggestion {
  range: {
    start: {
      line: number;
      column: number;
    };
    end: {
      line: number;
      column: number;
    };
  };
  text: string;
}

export class JsonFormatter {
  private issues: JsonIssue[] = [];
  private files = new Set<string>();
  private errorCount = 0;
  private warningCount = 0;

  addIssue(issue: JsonIssue): void {
    this.issues.push(issue);
    this.files.add(issue.file);

    if (issue.severity === 'error') {
      this.errorCount++;
    } else if (issue.severity === 'warning') {
      this.warningCount++;
    }
  }

  toValeFormat(): ValeOutput {
    const result: ValeOutput = {};

    // Group issues by file
    for (const issue of this.issues) {
      if (!result[issue.file]) {
        result[issue.file] = [];
      }

      // Calculate span based on match length
      // Span is [start_column, end_column] where both are 1-based positions
      const matchLen = issue.matchLength || issue.match.length;
      const endColumn = issue.column + matchLen;

      const valeIssue: ValeIssue = {
        Check: issue.rule,
        Description: '',
        Message: issue.message,
        Line: issue.line,
        Span: [issue.column, endColumn],
        Match: issue.match,
        Severity: issue.severity,
        Link: issue.suggestion || '',
      };

      result[issue.file]!.push(valeIssue);
    }

    return result;
  }

  toRdJsonFormat(): RdJsonResult {
    const diagnostics: RdJsonDiagnostic[] = this.issues.map((issue) => {
      const matchLen = issue.matchLength || issue.match.length;

      const diagnostic: RdJsonDiagnostic = {
        message: issue.message,
        location: {
          path: issue.file,
          range: {
            start: {
              line: issue.line,
              column: issue.column,
            },
            end: {
              line: issue.line,
              column: issue.column + matchLen,
            },
          },
        },
        severity: issue.severity === 'error' ? 'ERROR' : issue.severity === 'warning' ? 'WARNING' : 'INFO',
        code: {
          value: issue.rule,
        },
      };

      if (issue.suggestion) {
        diagnostic.message += `\n\nSuggestion: ${issue.suggestion}`;
      }

      // Note: We do not populate diagnostic.suggestions because vectorlint suggestions
      // are currently descriptive (e.g. "Change X to Y") rather than exact code replacements.
      // To support one-click fixes, we would need the LLM to return exact replacement text.

      return diagnostic;
    });

    return {
      source: {
        name: 'vectorlint',
        url: 'https://github.com/TRocket-Labs/vectorlint',
      },
      diagnostics,
    };
  }

  toJson(format: 'vale' | 'rdjson' = 'vale'): string {
    if (format === 'rdjson') {
      return JSON.stringify(this.toRdJsonFormat(), null, 2);
    }
    return JSON.stringify(this.toValeFormat(), null, 2);
  }

  getSummary() {
    return {
      files: this.files.size,
      errors: this.errorCount,
      warnings: this.warningCount,
      suggestions: 0, // VectorLint doesn't have suggestions as a separate category
    };
  }
}
