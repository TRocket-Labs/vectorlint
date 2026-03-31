import { z } from 'zod';
import { Severity } from '../evaluators/types';

export const LINT_TOOL_INPUT_SCHEMA = z.object({
  file: z.string().min(1),
  ruleSource: z.string().min(1),
  context: z.string().optional(),
});

export const TOP_LEVEL_REPORT_INPUT_SCHEMA = z.object({
  kind: z.literal('top-level'),
  ruleSource: z.string().min(1),
  message: z.string().min(1),
  suggestion: z.string().optional(),
  references: z
    .array(
      z.object({
        file: z.string().min(1),
        startLine: z.number().int().positive().optional(),
        endLine: z.number().int().positive().optional(),
      })
    )
    .optional(),
});

export const FINALIZE_REVIEW_INPUT_SCHEMA = z.object({
  summary: z.string().optional(),
});

export const READ_FILE_INPUT_SCHEMA = z.object({
  path: z.string().min(1),
});

export const SEARCH_FILES_INPUT_SCHEMA = z.object({
  pattern: z.string().min(1),
});

export const LIST_DIRECTORY_INPUT_SCHEMA = z.object({
  path: z.string().min(1),
});

export const SESSION_EVENT_BASE_SCHEMA = z.object({
  sessionId: z.string().min(1),
  timestamp: z.string().datetime(),
});

const SESSION_STARTED_SCHEMA = SESSION_EVENT_BASE_SCHEMA.extend({
  eventType: z.literal('session_started'),
  payload: z.object({
    cwd: z.string().min(1),
    targets: z.array(z.string()),
  }),
});

const TOOL_CALL_STARTED_SCHEMA = SESSION_EVENT_BASE_SCHEMA.extend({
  eventType: z.literal('tool_call_started'),
  payload: z.object({
    toolName: z.string().min(1),
    input: z.record(z.unknown()).default({}),
  }),
});

const TOOL_CALL_FINISHED_SCHEMA = SESSION_EVENT_BASE_SCHEMA.extend({
  eventType: z.literal('tool_call_finished'),
  payload: z.object({
    toolName: z.string().min(1),
    success: z.boolean(),
    output: z.record(z.unknown()).default({}),
    error: z.string().optional(),
  }),
});

const FINDING_PAYLOAD_SCHEMA = z.object({
  kind: z.enum(['inline', 'top-level']),
  file: z.string().min(1),
  line: z.number().int().positive(),
  column: z.number().int().positive(),
  message: z.string().min(1),
  ruleSource: z.string().min(1),
  ruleId: z.string().min(1),
  severity: z.nativeEnum(Severity),
  suggestion: z.string().optional(),
  match: z.string().optional(),
});

const FINDING_RECORDED_INLINE_SCHEMA = SESSION_EVENT_BASE_SCHEMA.extend({
  eventType: z.literal('finding_recorded_inline'),
  payload: FINDING_PAYLOAD_SCHEMA,
});

const FINDING_RECORDED_TOP_LEVEL_SCHEMA = SESSION_EVENT_BASE_SCHEMA.extend({
  eventType: z.literal('finding_recorded_top_level'),
  payload: FINDING_PAYLOAD_SCHEMA,
});

const SESSION_FINALIZED_SCHEMA = SESSION_EVENT_BASE_SCHEMA.extend({
  eventType: z.literal('session_finalized'),
  payload: z.object({
    totalFindings: z.number().int().nonnegative(),
    summary: z.string().optional(),
  }),
});

export const SESSION_EVENT_SCHEMA = z.union([
  SESSION_STARTED_SCHEMA,
  TOOL_CALL_STARTED_SCHEMA,
  TOOL_CALL_FINISHED_SCHEMA,
  FINDING_RECORDED_INLINE_SCHEMA,
  FINDING_RECORDED_TOP_LEVEL_SCHEMA,
  SESSION_FINALIZED_SCHEMA,
]);

export type LintToolInput = z.infer<typeof LINT_TOOL_INPUT_SCHEMA>;
export type TopLevelReportInput = z.infer<typeof TOP_LEVEL_REPORT_INPUT_SCHEMA>;
export type FinalizeReviewInput = z.infer<typeof FINALIZE_REVIEW_INPUT_SCHEMA>;
export type ReadFileInput = z.infer<typeof READ_FILE_INPUT_SCHEMA>;
export type SearchFilesInput = z.infer<typeof SEARCH_FILES_INPUT_SCHEMA>;
export type ListDirectoryInput = z.infer<typeof LIST_DIRECTORY_INPUT_SCHEMA>;

export type SessionEvent = z.infer<typeof SESSION_EVENT_SCHEMA>;
export type SessionEventType = SessionEvent['eventType'];

export interface SessionEventInput {
  eventType: SessionEventType;
  payload: Record<string, unknown>;
}

export interface AgentFinding {
  file: string;
  line: number;
  column: number;
  message: string;
  ruleSource: string;
  ruleId: string;
  severity: Severity;
  suggestion?: string;
  match?: string;
}
