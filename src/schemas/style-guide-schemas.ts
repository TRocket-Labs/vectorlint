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
    version: z.string().optional(),
    description: z.string().optional(),
    rules: z.array(STYLE_GUIDE_RULE_SCHEMA),
    metadata: z.record(z.unknown()).optional(),
}).strict();

export type StyleGuideExamples = z.infer<typeof STYLE_GUIDE_EXAMPLES_SCHEMA>;
export type StyleGuideRule = z.infer<typeof STYLE_GUIDE_RULE_SCHEMA>;
export type ParsedStyleGuide = z.infer<typeof STYLE_GUIDE_SCHEMA>;
