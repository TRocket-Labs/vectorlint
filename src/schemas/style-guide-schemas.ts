import { z } from 'zod';

export const STYLE_GUIDE_EXAMPLES_SCHEMA = z.object({
    good: z.array(z.string()).optional(),
    bad: z.array(z.string()).optional(),
}).strict();

export const STYLE_GUIDE_RULE_SCHEMA = z.object({
    id: z.string(),
    category: z.string().optional(),
    description: z.string(),
    severity: z.enum(['error', 'warning']).optional(),
    examples: STYLE_GUIDE_EXAMPLES_SCHEMA.optional(),
    weight: z.number().positive().optional(),
    metadata: z.record(z.unknown()).optional(),
}).strict();

export const STYLE_GUIDE_SCHEMA = z.object({
    name: z.string(),
    content: z.string(), // Raw markdown content for LLM processing
}).strict();


/**
 * Schema for generating a category-level evaluation prompt
 * This handles multiple related rules in a single rule
 */
export const CATEGORY_RULE_GENERATION_SCHEMA = z.object({
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



/**
 * Schema for the first step: Identifying evaluation types and their descriptions
 */
export const TYPE_IDENTIFICATION_SCHEMA = z.object({
    types: z.array(z.object({
        type: z.enum(['objective', 'semi-objective', 'subjective']),
        description: z.string().describe('Description of the rule type'),
        ruleCount: z.number().int().describe('Estimated number of rules for this type'),
        rules: z.array(z.string()).describe('Raw text of the rules belonging to this type'),
    })),
});

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

/**
 * Schema for the LLM output when generating an evaluation prompt
 */
export const RULE_GENERATION_SCHEMA = z.object({
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

export type RuleGenerationOutput = z.infer<typeof RULE_GENERATION_SCHEMA>;
export type CategoryRuleGenerationOutput = z.infer<typeof CATEGORY_RULE_GENERATION_SCHEMA>;
export type StyleGuideExamples = z.infer<typeof STYLE_GUIDE_EXAMPLES_SCHEMA>;
export type StyleGuideRule = z.infer<typeof STYLE_GUIDE_RULE_SCHEMA>;
export type ParsedStyleGuide = z.infer<typeof STYLE_GUIDE_SCHEMA>;
export type CategoryExtractionOutput = z.infer<typeof CATEGORY_EXTRACTION_SCHEMA>;
export type TypeIdentificationOutput = z.infer<typeof TYPE_IDENTIFICATION_SCHEMA>;

