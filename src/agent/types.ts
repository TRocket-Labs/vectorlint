import { z } from 'zod';
import type { PromptFile } from '../schemas/prompt-schemas.js';

export const INLINE_FINDING_SCHEMA = z.object({
  kind: z.literal('inline'),
  file: z.string(),
  startLine: z.number(),
  endLine: z.number(),
  message: z.string(),
  suggestion: z.string().optional(),
  ruleId: z.string(),
});

export const TOP_LEVEL_FINDING_SCHEMA = z.object({
  kind: z.literal('top-level'),
  references: z.array(
    z.object({
      file: z.string(),
      startLine: z.number().optional(),
      endLine: z.number().optional(),
    })
  ).optional(),
  message: z.string(),
  suggestion: z.string().optional(),
  ruleId: z.string(),
});

export const AGENT_FINDING_SCHEMA = z.discriminatedUnion('kind', [
  INLINE_FINDING_SCHEMA,
  TOP_LEVEL_FINDING_SCHEMA,
]);

export interface AgentFileRuleMapEntry {
  file: string;
  rules: PromptFile[];
}

export {
  INLINE_FINDING_SCHEMA as InlineFindingSchema,
  TOP_LEVEL_FINDING_SCHEMA as TopLevelFindingSchema,
  AGENT_FINDING_SCHEMA as AgentFindingSchema,
};

export type AgentFinding = z.infer<typeof AGENT_FINDING_SCHEMA>;
export type InlineFinding = z.infer<typeof INLINE_FINDING_SCHEMA>;
export type TopLevelFinding = z.infer<typeof TOP_LEVEL_FINDING_SCHEMA>;

export interface AgentRunResult {
  findings: AgentFinding[];
  ruleId: string;
  error?: string;
}
