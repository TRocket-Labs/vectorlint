import { Severity } from '../review/severity';
import { CLI_VERSION } from '../config/constants';
export interface ScoreComponent {
  criterion?: string;
  rawScore: number;
  maxScore: number;
  normalizedScore: number;
  normalizedMaxScore: number;
}

export interface ReviewScoreOutput {
  id: string;
  scores: ScoreComponent[];
}

export interface Issue {
  line: number;
  column: number;
  span: [number, number];
  severity: Severity;
  message: string;
  rule: string;
  match: string;
  analysis?: string;
  suggestion?: string;
  fix?: string;
}

export interface FileResult {
  issues: Issue[];
  reviewScores: ReviewScoreOutput[];
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

export class JsonFormatter {
  private files: Record<string, FileResult> = {};
  private errorCount = 0;
  private warningCount = 0;

  addIssue(file: string, issue: Issue): void {
    if (!this.files[file]) {
      this.files[file] = { issues: [], reviewScores: [] };
    }
    this.files[file].issues.push(issue);

    if (issue.severity === Severity.ERROR) {
      this.errorCount++;
    } else if (issue.severity === Severity.WARNING) {
      this.warningCount++;
    }
  }

  addReviewScore(file: string, score: ReviewScoreOutput): void {
    if (!this.files[file]) {
      this.files[file] = { issues: [], reviewScores: [] };
    }
    this.files[file].reviewScores.push(score);
  }

  toJson(): string {
    const result: Result = {
      files: this.files,
      summary: {
        files: Object.keys(this.files).length,
        errors: this.errorCount,
        warnings: this.warningCount,
      },
      metadata: {
        version: CLI_VERSION,
        timestamp: new Date().toISOString(),
      },
    };
    return JSON.stringify(result, null, 2);
  }
}
