import { z } from 'zod';

/**
 * Schema for generating a category-level evaluation prompt
 * This handles multiple related rules in a single eval
 */
export const CATEGORY_EVAL_GENERATION_SCHEMA = z.object({
    evaluationType: z.enum(['subjective', 'semi-objective', 'objective']),
    categoryName: z.string().describe('The category this eval covers'),
    promptBody: z.string().describe('The main instruction for the LLM evaluator'),
    criteria: z.array(z.object({
        name: z.string().describe('Criterion name (usually the rule description)'),
        id: z.string().describe('PascalCase criterion ID (e.g., "VoiceSecondPersonPreferred")'),
        weight: z.number().positive().describe('Weight of this criterion in overall score'),
        rubric: z.array(z.object({
            score: z.number().int().min(1).max(4),
            label: z.string(),
            description: z.string(),
        })).optional().describe('Rubric for subjective criteria'),
    })),
    examples: z.object({
        good: z.array(z.string()).optional(),
        bad: z.array(z.string()).optional(),
    }).optional(),
});

export type CategoryEvalGenerationOutput = z.infer<typeof CATEGORY_EVAL_GENERATION_SCHEMA>;



/**
 * Schema for extracting and categorizing rules from a style guide
 */
export const CATEGORY_EXTRACTION_SCHEMA = z.object({
    categories: z.array(z.object({
        name: z.string().describe('Category name (e.g., "Voice & Tone", "Evidence & Citations")'),
        id: z.string().describe('PascalCase category ID (e.g., "VoiceTone")'),
        type: z.enum(['subjective', 'semi-objective', 'objective']).describe('Evaluation type for this category'),
        description: z.string().describe('Brief description of what this category covers'),
        rules: z.array(z.object({
            description: z.string().describe('The rule text from the style guide'),
            severity: z.enum(['error', 'warning']).optional().describe('Suggested severity level'),
            examples: z.object({
                good: z.array(z.string()).optional(),
                bad: z.array(z.string()).optional(),
            }).optional(),
        })),
        priority: z.number().int().min(1).max(10).describe('Priority level (1=highest, 10=lowest)'),
    })),
});
export type CategoryExtractionOutput = z.infer<typeof CATEGORY_EXTRACTION_SCHEMA>;

