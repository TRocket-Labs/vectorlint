import { z } from 'zod';

/**
 * Schema for the LLM output when generating an evaluation prompt
 */
export const EVAL_GENERATION_SCHEMA = z.object({
    evaluationType: z.enum(['subjective', 'semi-objective']),
    promptBody: z.string().describe('The main instruction for the LLM evaluator'),
    criteria: z.array(z.object({
        name: z.string(),
        id: z.string(),
        weight: z.number().positive(),
        rubric: z.array(z.object({
            score: z.number().int().min(1).max(4),
            label: z.string(),
            description: z.string(),
        })).optional(),
    })).optional(),
    examples: z.object({
        good: z.array(z.string()).optional(),
        bad: z.array(z.string()).optional(),
    }).optional(),
});

export type EvalGenerationOutput = z.infer<typeof EVAL_GENERATION_SCHEMA>;
