import { z } from 'zod';

export const InlineFindingSchema = z.object({
  kind: z.literal('inline'),
  file: z.string(),
  startLine: z.number(),
  endLine: z.number(),
  message: z.string(),
  suggestion: z.string().optional(),
  ruleId: z.string(),
});

export const TopLevelFindingSchema = z.object({
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

export const AgentFindingSchema = z.discriminatedUnion('kind', [
  InlineFindingSchema,
  TopLevelFindingSchema,
]);

export type AgentFinding = z.infer<typeof AgentFindingSchema>;
export type InlineFinding = z.infer<typeof InlineFindingSchema>;
export type TopLevelFinding = z.infer<typeof TopLevelFindingSchema>;

export interface AgentRunResult {
  findings: AgentFinding[];
  ruleId: string;
}
