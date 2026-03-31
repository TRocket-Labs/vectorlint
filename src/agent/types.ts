/* eslint-disable @typescript-eslint/naming-convention */
import { z } from "zod";

export const RuleSourceSchema = z.string().min(1);

export const LintToolInputSchema = z.object({
  file: z.string().min(1),
  ruleSource: RuleSourceSchema,
  context: z.string().optional(),
});

export const TopLevelFindingReferenceSchema = z.object({
  file: z.string().min(1),
  startLine: z.number().int().positive().optional(),
  endLine: z.number().int().positive().optional(),
});

export const TopLevelReportInputSchema = z.object({
  kind: z.literal("top-level"),
  ruleSource: RuleSourceSchema,
  message: z.string().min(1),
  suggestion: z.string().optional(),
  references: z.array(TopLevelFindingReferenceSchema).optional(),
});

export const AgentFindingSchema = z.object({
  kind: z.enum(["inline", "top-level"]),
  ruleSource: RuleSourceSchema,
  ruleId: z.string().min(1),
  message: z.string().min(1),
  file: z.string().optional(),
  line: z.number().int().positive().optional(),
  column: z.number().int().positive().optional(),
  suggestion: z.string().optional(),
});

const SessionEnvelopeSchema = z.object({
  sessionId: z.string().min(1),
  timestamp: z.string().min(1),
});

export const SessionStartedEventSchema = SessionEnvelopeSchema.extend({
  eventType: z.literal("session_started"),
  payload: z.object({
    cwd: z.string().min(1),
  }),
});

export const ToolCallStartedEventSchema = SessionEnvelopeSchema.extend({
  eventType: z.literal("tool_call_started"),
  payload: z.object({
    toolName: z.string().min(1),
    input: z.unknown().optional(),
  }),
});

export const ToolCallFinishedEventSchema = SessionEnvelopeSchema.extend({
  eventType: z.literal("tool_call_finished"),
  payload: z.object({
    toolName: z.string().min(1),
    ok: z.boolean(),
    output: z.unknown().optional(),
    error: z.string().optional(),
  }),
});

export const InlineFindingRecordedEventSchema = SessionEnvelopeSchema.extend({
  eventType: z.literal("finding_recorded_inline"),
  payload: z.object({
    finding: AgentFindingSchema,
  }),
});

export const TopLevelFindingRecordedEventSchema = SessionEnvelopeSchema.extend({
  eventType: z.literal("finding_recorded_top_level"),
  payload: z.object({
    finding: AgentFindingSchema,
  }),
});

export const SessionFinalizedEventSchema = SessionEnvelopeSchema.extend({
  eventType: z.literal("session_finalized"),
  payload: z.object({
    totalFindings: z.number().int().nonnegative(),
  }),
});

export const SessionEventSchema = z.union([
  SessionStartedEventSchema,
  ToolCallStartedEventSchema,
  ToolCallFinishedEventSchema,
  InlineFindingRecordedEventSchema,
  TopLevelFindingRecordedEventSchema,
  SessionFinalizedEventSchema,
]);

export type LintToolInput = z.infer<typeof LintToolInputSchema>;
export type TopLevelReportInput = z.infer<typeof TopLevelReportInputSchema>;
export type AgentFinding = z.infer<typeof AgentFindingSchema>;
export type SessionEvent = z.infer<typeof SessionEventSchema>;

function toPascalCase(value: string): string {
  return value
    .replace(/\.[^.]+$/, "")
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((part) => part[0]!.toUpperCase() + part.slice(1))
    .join("");
}

export function canonicalRuleIdFromSource(ruleSource: string): string {
  const normalized = ruleSource.replace(/\\/g, "/");
  const parts = normalized.split("/").filter(Boolean);
  const ruleName = toPascalCase(parts.at(-1) ?? "rule");
  const packName = toPascalCase(parts.at(-2) ?? "default");
  return `${packName}.${ruleName}`;
}
