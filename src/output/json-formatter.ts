
export interface ScoreComponent {
  criterion?: string;
  rawScore: number;
  maxScore: number;
  weightedScore: number;
  weightedMaxScore: number;
  normalizedScore: number;
  normalizedMaxScore: number;
}

export interface EvaluationScore {
  id: string;
  scores: ScoreComponent[];
}

export interface Issue {
  line: number;
  column: number;
  span: [number, number];
  severity: 'error' | 'warning' | 'info';
  message: string;
  eval: string; // Renamed from rule
  match: string;
  suggestion?: string;
}

export interface FileResult {
  issues: Issue[];
  evaluationScores: EvaluationScore[];
}

export interface Result {
  files: Record<string, FileResult>;
  summary: {
    files: number;
    errors: number;
    warnings: number;
  };
  metadata: {
    version: string;
    timestamp: string;
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
  private files: Record<string, FileResult> = {};
  private errorCount = 0;
  private warningCount = 0;

  addIssue(file: string, issue: Issue): void {
    if (!this.files[file]) {
      this.files[file] = { issues: [], evaluationScores: [] };
    }
    this.files[file].issues.push(issue);

    if (issue.severity === 'error') {
      this.errorCount++;
    } else if (issue.severity === 'warning') {
      this.warningCount++;
    }
  }

  addEvaluationScore(file: string, score: EvaluationScore): void {
    if (!this.files[file]) {
      this.files[file] = { issues: [], evaluationScores: [] };
    }
    this.files[file].evaluationScores.push(score);
  }

  toRdJsonFormat(): RdJsonResult {
    const diagnostics: RdJsonDiagnostic[] = [];

    // Iterate over all files and their issues
    for (const [filePath, fileResult] of Object.entries(this.files)) {
      for (const issue of fileResult.issues) {
        const matchLen = issue.match.length;

        const diagnostic: RdJsonDiagnostic = {
          message: issue.message,
          location: {
            path: filePath,
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
            value: issue.eval,
          },
        };

        if (issue.suggestion) {
          diagnostic.suggestions = [
            {
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
              text: issue.suggestion,
            },
          ];
        }

        diagnostics.push(diagnostic);
      }
    }

    return {
      source: {
        name: 'vectorlint',
        url: 'https://github.com/TRocket-Labs/vectorlint',
      },
      diagnostics,
    };
  }

  toJson(format: 'standard' | 'rdjson' = 'standard'): string {
    if (format === 'rdjson') {
      return JSON.stringify(this.toRdJsonFormat(), null, 2);
    }
    const result: Result = {
      files: this.files,
      summary: {
        files: Object.keys(this.files).length,
        errors: this.errorCount,
        warnings: this.warningCount,
      },
      metadata: {
        version: '1.0.0', // TODO: Get from package.json
        timestamp: new Date().toISOString(),
      },
    };
    return JSON.stringify(result, null, 2);
  }
}
