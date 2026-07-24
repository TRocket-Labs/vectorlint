import type { PromptFile } from '../prompts/prompt-loader';
import type { StructuredModelClient } from '../providers/structured-model-client';
import type { ToolCallingModelClient } from '../providers/tool-calling-model-client';
import type { RequestBuilder } from '../providers/request-builder';
import type { FilePatternConfig } from '../boundaries/file-section-parser';
import type { ReviewSummary } from '../output/reporter';
import { ValeJsonFormatter } from '../output/vale-json-formatter';
import { JsonFormatter } from '../output/json-formatter';
import { RdJsonFormatter } from '../output/rdjson-formatter';
import { Severity } from '../review/severity';
import type { TokenUsageStats, PricingConfig } from '../providers/token-usage';
import type { Logger } from '../logging/logger';
import type { ReviewModelCall } from '../review/types';

export { REVIEW_MODEL_CALLS } from '../review/executor';
export type { ReviewModelCall } from '../review/types';

export enum OutputFormat {
    Line = "line",
    Json = "json",
    ValeJson = "vale-json",
    RdJson = "rdjson",
}

export const OUTPUT_FORMATS = [
    OutputFormat.Line,
    OutputFormat.Json,
    OutputFormat.ValeJson,
    OutputFormat.RdJson,
] as const;

export const DEFAULT_OUTPUT_FORMAT = OUTPUT_FORMATS[0];

/** Default reviewer model-call strategy. */
export const DEFAULT_REVIEW_MODEL_CALL: ReviewModelCall = 'auto';

export interface ReviewOptions {
    prompts: PromptFile[];
    rulesPath: string | undefined;
    provider: StructuredModelClient & ToolCallingModelClient;
    requestBuilder: RequestBuilder;
    concurrency: number;
    verbose: boolean;
    debugJson?: boolean;
    scanPaths: FilePatternConfig[];
    outputFormat?: OutputFormat;
    modelCall: ReviewModelCall;
    pricing?: PricingConfig;
    userInstructionContent?: string;
    logger?: Logger;
}

export interface ReviewRunResult {
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
    scoreEntries?: ReviewSummary[];
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
    analysis?: string;
    suggestion?: string;
    fix?: string;
    scoreText?: string;
    match?: string;
}

export interface ReviewFileResult extends ErrorTrackingResult {
    requestFailures: number;
    tokenUsage?: TokenUsageStats;
}
