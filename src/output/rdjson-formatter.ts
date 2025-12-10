import type { Issue, EvaluationScore } from './json-formatter';
import { Severity } from '../evaluators/types';

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
    severity: Severity;
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

interface FileResult {
    issues: Issue[];
    evaluationScores: EvaluationScore[];
}

export class RdJsonFormatter {
    private files: Record<string, FileResult> = {};

    addIssue(file: string, issue: Issue): void {
        if (!this.files[file]) {
            this.files[file] = { issues: [], evaluationScores: [] };
        }
        this.files[file].issues.push(issue);
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
                    severity: issue.severity === Severity.ERROR ? Severity.ERROR : Severity.WARNING,
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

    toJson(): string {
        return JSON.stringify(this.toRdJsonFormat(), null, 2);
    }
}
