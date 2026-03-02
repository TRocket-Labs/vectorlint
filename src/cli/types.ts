import type { PromptFile } from '../prompts/prompt-loader';
import type { LLMProvider } from '../providers/llm-provider';
import type { SearchProvider } from '../providers/search-provider';
import type { PromptMeta, PromptCriterionSpec } from '../schemas/prompt-schemas';
import type { FilePatternConfig } from '../boundaries/file-section-parser';
import type { EvaluationSummary } from '../output/reporter';
import { ValeJsonFormatter } from '../output/vale-json-formatter';
import { JsonFormatter, type ScoreComponent } from '../output/json-formatter';
import { RdJsonFormatter } from '../output/rdjson-formatter';
import type { PromptEvaluationResult, JudgeResult } from '../prompts/schema';
import { Severity } from '../evaluators/types';
import type { TokenUsageStats, PricingConfig } from '../providers/token-usage';

export enum OutputFormat {
    Line = "line",
    Json = "json",
    ValeJson = "vale-json",
    RdJson = "rdjson",
}

export interface EvaluationOptions {
    prompts: PromptFile[];
    rulesPath: string | undefined;
    provider: LLMProvider;
    searchProvider?: SearchProvider;
    concurrency: number;
    verbose: boolean;
    debugJson?: boolean;
    scanPaths: FilePatternConfig[];
    outputFormat?: OutputFormat;
    pricing?: PricingConfig;
    userInstructionContent?: string;
}

export interface EvaluationResult {
    totalFiles: number;
    totalErrors: number;
    totalWarnings: number;
    requestFailures: number;
    hadOperationalErrors: boolean;
    hadSeverityErrors: boolean;
    tokenUsage?: TokenUsageStats;
}

export interface ErrorTrackingResult {
    errors: number;
    warnings: number;
    hadOperationalErrors: boolean;
    hadSeverityErrors: boolean;
    scoreEntries?: EvaluationSummary[];
}

export interface EvaluationContext {
    content: string;
    relFile: string;
    outputFormat: OutputFormat;
    jsonFormatter: ValeJsonFormatter | JsonFormatter | RdJsonFormatter;
    verbose?: boolean;
    debugJson?: boolean;
}

export interface ReportIssueParams {
    file: string;
    line: number;
    column: number;
    severity: Severity;
    summary: string;
    ruleName: string;
    outputFormat: OutputFormat;
    jsonFormatter: ValeJsonFormatter | JsonFormatter | RdJsonFormatter;
    suggestion?: string;
    fix?: string;
    scoreText?: string;
    match?: string;
}

export interface ProcessViolationsParams extends EvaluationContext {
    violations: Array<{
        line?: number;
        quoted_text?: string;
        context_before?: string;
        context_after?: string;
        analysis?: string;
        suggestion?: string;
        fix?: string;
    }>;
    severity: Severity;
    ruleName: string;
    scoreText: string;
}

export interface ProcessCriterionParams extends EvaluationContext {
    exp: PromptCriterionSpec;
    result: JudgeResult;
    packName: string;
    promptId: string;
    promptFilename: string;
    meta: PromptMeta;
}

export interface ProcessCriterionResult extends ErrorTrackingResult {
    userScore: number;
    maxScore: number;
    scoreEntry: { id: string; scoreText: string; score?: number };
    scoreComponent?: ScoreComponent;
}

export interface ValidationParams {
    meta: PromptMeta;
    result: JudgeResult;
}

export interface ProcessPromptResultParams extends EvaluationContext {
    promptFile: PromptFile;
    result: PromptEvaluationResult;
}

export interface RunPromptEvaluationParams {
    promptFile: PromptFile;
    relFile: string;
    content: string;
    provider: LLMProvider;
    searchProvider?: SearchProvider;
}

export interface RunPromptEvaluationResultSuccess {
    ok: true;
    result: PromptEvaluationResult;
}

export type RunPromptEvaluationResult =
    | RunPromptEvaluationResultSuccess
    | { ok: false; error: Error };

export interface EvaluateFileParams {
    file: string;
    options: EvaluationOptions;
    jsonFormatter: ValeJsonFormatter | JsonFormatter | RdJsonFormatter;
}

export interface EvaluateFileResult extends ErrorTrackingResult {
    requestFailures: number;
    tokenUsage?: TokenUsageStats;
}
