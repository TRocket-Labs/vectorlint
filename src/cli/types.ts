import type { RuleFile } from '../rules/rule-loader';
import type { LLMProvider } from '../providers/llm-provider';
import type { CapabilityProviderResolver } from '../providers/capability-provider-resolver';
import type { SearchProvider } from '../providers/search-provider';
import type { FilePatternConfig } from '../boundaries/file-section-parser';
import type { EvaluationSummary } from '../output/reporter';
import { ValeJsonFormatter } from '../output/vale-json-formatter';
import { JsonFormatter } from '../output/json-formatter';
import { RdJsonFormatter } from '../output/rdjson-formatter';
import type { PromptEvaluationResult } from '../prompts/schema';
import type { TokenUsageStats, PricingConfig } from '../providers/token-usage';

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

export const REVIEW_MODES = ['lint', 'agent'] as const;
export const DEFAULT_REVIEW_MODE = REVIEW_MODES[0];
export const AGENT_REVIEW_MODE = REVIEW_MODES[1];

export type ReviewMode = (typeof REVIEW_MODES)[number];

export interface EvaluationOptions {
    rules: RuleFile[];
    rulesPath: string | undefined;
    provider: LLMProvider;
    capabilityProviderResolver?: CapabilityProviderResolver;
    searchProvider?: SearchProvider;
    concurrency: number;
    verbose: boolean;
    debugJson?: boolean;
    scanPaths: FilePatternConfig[];
    outputFormat?: OutputFormat;
    mode?: ReviewMode;
    printMode?: boolean;
    agentMaxRetries?: number;
    pricing?: PricingConfig;
    systemDirective?: string;
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

export interface ProcessPromptResultParams extends EvaluationContext {
    promptFile: RuleFile;
    result: PromptEvaluationResult;
}

export interface RunPromptEvaluationParams {
    promptFile: RuleFile;
    relFile: string;
    content: string;
    provider: LLMProvider;
    searchProvider?: SearchProvider;
    systemDirective?: string;
    userInstructions?: string;
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
