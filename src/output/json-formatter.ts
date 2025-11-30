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

    toJson(): string {
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
