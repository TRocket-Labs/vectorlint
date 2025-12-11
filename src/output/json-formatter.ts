import { createRequire } from 'node:module';
import { z } from 'zod';
import { Severity } from '../evaluators/types';

const REQUIRE = createRequire(import.meta.url);

const PACKAGE_JSON_SCHEMA = z.object({
  version: z.string(),
});

// Using require to load JSON in ESM
const RAW_PACKAGE_JSON: unknown = REQUIRE('../../package.json');
const PKG = PACKAGE_JSON_SCHEMA.parse(RAW_PACKAGE_JSON);
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
  severity: Severity;
  message: string;
  rule: string;
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

export class JsonFormatter {
  private files: Record<string, FileResult> = {};
  private errorCount = 0;
  private warningCount = 0;

  addIssue(file: string, issue: Issue): void {
    if (!this.files[file]) {
      this.files[file] = { issues: [], evaluationScores: [] };
    }
    this.files[file].issues.push(issue);

    if (issue.severity === Severity.ERROR) {
      this.errorCount++;
    } else if (issue.severity === Severity.WARNING) {
      this.warningCount++;
    }
  }

  addEvaluationScore(file: string, score: EvaluationScore): void {
    if (!this.files[file]) {
      this.files[file] = { issues: [], evaluationScores: [] };
    }
    this.files[file].evaluationScores.push(score);
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
        version: PKG.version,
        timestamp: new Date().toISOString(),
      },
    };
    return JSON.stringify(result, null, 2);
  }
}
