import { z } from 'zod';
import type { PromptFile } from '../schemas/prompt-schemas';
import type { PromptEvaluationResult } from '../prompts/schema';

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
  references: z
    .array(
      z.object({
        file: z.string(),
        startLine: z.number().optional(),
        endLine: z.number().optional(),
      })
    )
    .optional(),
  message: z.string(),
  suggestion: z.string().optional(),
  ruleId: z.string(),
});

export const AGENT_FINDING_SCHEMA = z.discriminatedUnion('kind', [
  INLINE_FINDING_SCHEMA,
  TOP_LEVEL_FINDING_SCHEMA,
]);

export type AgentFinding = z.infer<typeof AGENT_FINDING_SCHEMA>;
export type InlineFinding = z.infer<typeof INLINE_FINDING_SCHEMA>;
export type TopLevelFinding = z.infer<typeof TOP_LEVEL_FINDING_SCHEMA>;

export interface TaskPlan {
  lintTasks: Array<{ rule: PromptFile; targetFiles: string[] }>;
  agentTasks: Array<{ rule: PromptFile }>;
}

export const TASK_PLAN_SCHEMA = z.object({
  lintTasks: z.array(
    z.object({
      rule: z.unknown(),
      targetFiles: z.array(z.string()),
    })
  ),
  agentTasks: z.array(
    z.object({
      rule: z.unknown(),
    })
  ),
});

export {
  INLINE_FINDING_SCHEMA as InlineFindingSchema,
  TOP_LEVEL_FINDING_SCHEMA as TopLevelFindingSchema,
  AGENT_FINDING_SCHEMA as AgentFindingSchema,
  TASK_PLAN_SCHEMA as TaskPlanSchema,
};

export type MergedFinding =
  | { source: 'lint'; file: string; result: PromptEvaluationResult }
  | { source: 'agent'; finding: AgentFinding };

export interface AgentRunResult {
  findings: AgentFinding[];
  ruleId: string;
}
