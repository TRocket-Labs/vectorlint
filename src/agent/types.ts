import { z } from 'zod';
import { MODEL_CAPABILITY_TIERS } from '../providers/model-capability';

export const SESSION_EVENT_TYPE = {
  SessionStarted: 'session_started',
  ToolCallStarted: 'tool_call_started',
  ToolCallFinished: 'tool_call_finished',
  FindingRecordedInline: 'finding_recorded_inline',
  FindingRecordedTopLevel: 'finding_recorded_top_level',
  SessionFinalized: 'session_finalized',
} as const;

export const TRIMMED_NON_BLANK_STRING = z.string().trim().min(1);

export const RULE_CALL_SCHEMA = z.object({
  ruleSource: TRIMMED_NON_BLANK_STRING,
  reviewInstruction: TRIMMED_NON_BLANK_STRING.optional(),
  context: TRIMMED_NON_BLANK_STRING.optional(),
});

export const LINT_TOOL_INPUT_SCHEMA = z.object({
  file: TRIMMED_NON_BLANK_STRING,
  rules: z.array(RULE_CALL_SCHEMA).min(1),
});

export const MODEL_CAPABILITY_TIER_SCHEMA = z.enum(MODEL_CAPABILITY_TIERS);

export const AGENT_TOOL_INPUT_SCHEMA = z.object({
  task: TRIMMED_NON_BLANK_STRING,
  label: TRIMMED_NON_BLANK_STRING.optional(),
  model: MODEL_CAPABILITY_TIER_SCHEMA.optional(),
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
  eventType: z.literal(SESSION_EVENT_TYPE.SessionStarted),
  payload: z.object({
    cwd: z.string().min(1),
    targets: z.array(z.string().min(1)),
  }),
});

const TOOL_CALL_STARTED_EVENT_SCHEMA = SESSION_EVENT_BASE_SCHEMA.extend({
  eventType: z.literal(SESSION_EVENT_TYPE.ToolCallStarted),
  payload: z.object({
    toolName: z.string().min(1),
    input: z.unknown(),
  }),
});

const TOOL_CALL_FINISHED_EVENT_SCHEMA = SESSION_EVENT_BASE_SCHEMA.extend({
  eventType: z.literal(SESSION_EVENT_TYPE.ToolCallFinished),
  payload: z.object({
    toolName: z.string().min(1),
    ok: z.boolean(),
    output: z.unknown().optional(),
    error: z.string().optional(),
  }),
});

const FINDING_RECORDED_INLINE_EVENT_SCHEMA = SESSION_EVENT_BASE_SCHEMA.extend({
  eventType: z.literal(SESSION_EVENT_TYPE.FindingRecordedInline),
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
  eventType: z.literal(SESSION_EVENT_TYPE.FindingRecordedTopLevel),
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
  eventType: z.literal(SESSION_EVENT_TYPE.SessionFinalized),
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
