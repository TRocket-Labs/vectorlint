import type { PromptFile } from "../prompts/prompt-loader";
import type { LLMProvider } from "../providers/llm-provider";
import type { SearchProvider } from "../providers/search-provider";
import type {
  PromptMeta,
  PromptCriterionSpec,
} from "../schemas/prompt-schemas";
import type { FilePatternConfig } from "../boundaries/file-section-parser";
import type { EvaluationSummary } from "../output/reporter";
import { ValeJsonFormatter } from "../output/vale-json-formatter";
import { JsonFormatter, type ScoreComponent } from "../output/json-formatter";
import { RdJsonFormatter } from "../output/rdjson-formatter";
import type {
  EvaluationResult as PromptEvaluationResult,
  SubjectiveResult,
} from "../prompts/schema";
import { Severity } from "../evaluators/types";

export enum OutputFormat {
  Line = "line",
  Json = "json",
  ValeJson = "vale-json",
  RdJson = "rdjson",
}

export interface EvaluationOptions {
  prompts: PromptFile[];
  rulesPath: string;
  provider: LLMProvider;
  searchProvider?: SearchProvider;
  concurrency: number;
  verbose: boolean;
  scanPaths: FilePatternConfig[];
  outputFormat?: OutputFormat;
}

export interface EvaluationResult {
  totalFiles: number;
  totalErrors: number;
  totalWarnings: number;
  requestFailures: number;
  hadOperationalErrors: boolean;
  hadSeverityErrors: boolean;
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
  scoreText?: string;
  match?: string;
}

export interface ExtractMatchTextParams {
  content: string;
  line: number;
  matchedText: string;
  rowSummary: string;
}

export interface LocationMatch {
  line: number;
  column: number;
  match: string;
}

export interface ProcessViolationsParams extends EvaluationContext {
  violations: Array<{
    quoted_text?: string;
    context_before?: string;
    context_after?: string;
    analysis?: string;
    suggestion?: string;
  }>;
  severity: Severity;
  ruleName: string;
  scoreText: string;
}

export interface ProcessCriterionParams extends EvaluationContext {
  exp: PromptCriterionSpec;
  result: SubjectiveResult;
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
  result: SubjectiveResult;
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

export type RunPromptEvaluationResult =
  | { ok: true; result: PromptEvaluationResult }
  | { ok: false; error: Error };

export interface EvaluateFileParams {
  file: string;
  options: EvaluationOptions;
  jsonFormatter: ValeJsonFormatter | JsonFormatter | RdJsonFormatter;
}

export interface EvaluateFileResult extends ErrorTrackingResult {
  requestFailures: number;
}
