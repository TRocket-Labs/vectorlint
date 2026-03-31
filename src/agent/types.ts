import { z } from 'zod';

export const LINT_TOOL_INPUT_SCHEMA = z.object({
  file: z.string().min(1),
  ruleSource: z.string().min(1),
  context: z.string().optional(),
});

export const TOP_LEVEL_REFERENCE_SCHEMA = z.object({
  file: z.string().min(1),
  startLine: z.number().int().positive(),
  endLine: z.number().int().positive(),
});

export const TOP_LEVEL_REPORT_INPUT_SCHEMA = z.object({
  kind: z.literal('top-level'),
  ruleSource: z.string().min(1),
  message: z.string().min(1),
  suggestion: z.string().optional(),
  references: z.array(TOP_LEVEL_REFERENCE_SCHEMA).optional(),
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

export const SEARCH_CONTENT_INPUT_SCHEMA = z.object({
  pattern: z.string().min(1),
  path: z.string().optional(),
  glob: z.string().optional(),
});

export const FINALIZE_REVIEW_INPUT_SCHEMA = z.object({
  summary: z.string().optional(),
});

const SESSION_EVENT_BASE_SCHEMA = z.object({
  sessionId: z.string().min(1),
  timestamp: z.string().min(1),
});

const SESSION_STARTED_EVENT_SCHEMA = SESSION_EVENT_BASE_SCHEMA.extend({
  eventType: z.literal('session_started'),
  payload: z.object({
    cwd: z.string().min(1),
    targets: z.array(z.string().min(1)),
  }),
});

const TOOL_CALL_STARTED_EVENT_SCHEMA = SESSION_EVENT_BASE_SCHEMA.extend({
  eventType: z.literal('tool_call_started'),
  payload: z.object({
    toolName: z.string().min(1),
    input: z.unknown(),
  }),
});

const TOOL_CALL_FINISHED_EVENT_SCHEMA = SESSION_EVENT_BASE_SCHEMA.extend({
  eventType: z.literal('tool_call_finished'),
  payload: z.object({
    toolName: z.string().min(1),
    ok: z.boolean(),
    output: z.unknown().optional(),
    error: z.string().optional(),
  }),
});

const FINDING_RECORDED_INLINE_EVENT_SCHEMA = SESSION_EVENT_BASE_SCHEMA.extend({
  eventType: z.literal('finding_recorded_inline'),
  payload: z.object({
    file: z.string().min(1),
    line: z.number().int().positive(),
    column: z.number().int().positive().optional(),
    severity: z.enum(['error', 'warning']).optional(),
    ruleId: z.string().min(1).optional(),
    ruleSource: z.string().min(1),
    message: z.string().min(1),
    analysis: z.string().optional(),
    suggestion: z.string().optional(),
    fix: z.string().optional(),
    match: z.string().optional(),
  }),
});

const FINDING_RECORDED_TOP_LEVEL_EVENT_SCHEMA = SESSION_EVENT_BASE_SCHEMA.extend({
  eventType: z.literal('finding_recorded_top_level'),
  payload: z.object({
    file: z.string().min(1).optional(),
    line: z.number().int().positive().optional(),
    column: z.number().int().positive().optional(),
    severity: z.enum(['error', 'warning']).optional(),
    ruleId: z.string().min(1).optional(),
    ruleSource: z.string().min(1),
    message: z.string().min(1),
    suggestion: z.string().optional(),
    references: z.array(TOP_LEVEL_REFERENCE_SCHEMA).optional(),
  }),
});

const SESSION_FINALIZED_EVENT_SCHEMA = SESSION_EVENT_BASE_SCHEMA.extend({
  eventType: z.literal('session_finalized'),
  payload: z.object({
    totalFindings: z.number().int().nonnegative(),
    summary: z.string().optional(),
  }),
});

export const SESSION_EVENT_SCHEMA = z.discriminatedUnion('eventType', [
  SESSION_STARTED_EVENT_SCHEMA,
  TOOL_CALL_STARTED_EVENT_SCHEMA,
  TOOL_CALL_FINISHED_EVENT_SCHEMA,
  FINDING_RECORDED_INLINE_EVENT_SCHEMA,
  FINDING_RECORDED_TOP_LEVEL_EVENT_SCHEMA,
  SESSION_FINALIZED_EVENT_SCHEMA,
]);

export type SessionEvent = z.infer<typeof SESSION_EVENT_SCHEMA>;
