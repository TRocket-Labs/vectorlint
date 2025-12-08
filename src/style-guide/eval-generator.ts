import { z } from 'zod';
import { LLMProvider } from '../providers/llm-provider';
import { StyleGuideRule, ParsedStyleGuide } from '../schemas/style-guide-schemas';
import { EVAL_GENERATION_SCHEMA, EvalGenerationOutput } from '../schemas/eval-generation-schema';
import { EvalGenerationError } from '../errors/style-guide-errors';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { TemplateRenderer } from './template-renderer';

export interface EvalGenerationOptions {
    llmProvider: LLMProvider;
    templateDir?: string | undefined;
    defaultSeverity?: 'error' | 'warning' | undefined;
    strictness?: 'lenient' | 'standard' | 'strict' | undefined;
}

export interface GeneratedEval {
    filename: string;
    content: string;
    meta: {
        id: string;
        name: string;
        severity: string;
        type: string;
    };
}

export class EvalGenerator {
    private llmProvider: LLMProvider;
    private options: EvalGenerationOptions;
    private renderer: TemplateRenderer;

    constructor(options: EvalGenerationOptions) {
        this.llmProvider = options.llmProvider;
        this.options = {
            defaultSeverity: 'warning',
            strictness: 'standard',
            ...options,
        };
        this.renderer = new TemplateRenderer(options.templateDir);
    }

    /**
     * Generate evaluations from a parsed style guide
     */
    public async generateEvalsFromStyleGuide(
        styleGuide: ParsedStyleGuide
    ): Promise<GeneratedEval[]> {
        const evals: GeneratedEval[] = [];

        let completed = 0;
        for (const rule of styleGuide.rules) {
            try {
                const generatedEval = await this.generateEval(rule);
                evals.push(generatedEval);
                completed++;
                if (completed % 5 === 0 || completed === styleGuide.rules.length) {
                    console.log(`[EvalGenerator] Progress: ${completed}/${styleGuide.rules.length} rules processed`);
                }
            } catch (error) {
                console.error(`Failed to generate eval for rule ${rule.id}:`, error);
                // Continue with other rules
            }
        }

        return evals;
    }

    /**
     * Generate a single evaluation from a rule
     */
    public async generateEval(rule: StyleGuideRule): Promise<GeneratedEval> {
        const prompt = this.buildPrompt(rule);

        try {
            const schemaJson = zodToJsonSchema(EVAL_GENERATION_SCHEMA);

            // The LLMProvider expects { name: string; schema: Record<string, unknown> }
            // zodToJsonSchema returns a schema object that might have $schema, etc.
            // We need to cast or massage it to fit the interface if strict.
            // Assuming schema property expects the JSON schema object.

            const result = await this.llmProvider.runPromptStructured<EvalGenerationOutput>(
                JSON.stringify(rule), // Context
                prompt,               // System/User prompt
                {
                    name: 'evalGeneration',
                    schema: schemaJson as Record<string, unknown>
                }
            );

            return this.formatEval(rule, result);
        } catch (error) {
            throw new EvalGenerationError(
                `LLM generation failed: ${(error as Error).message}`,
                rule.id
            );
        }
    }

    /**
     * Build the prompt for the LLM
     */
    private buildPrompt(rule: StyleGuideRule): string {
        return `
You are an expert in creating automated content evaluation prompts.
Your task is to convert a style guide rule into a structured evaluation prompt for an LLM.

Rule ID: ${rule.id}
Category: ${rule.category}
Description: ${rule.description}
Severity: ${rule.severity || this.options.defaultSeverity}
${rule.examples ? `Examples:\nGood: ${rule.examples.good?.join(', ')}\nBad: ${rule.examples.bad?.join(', ')}` : ''}

Strictness Level: ${this.options.strictness}

Instructions:
1. Analyze the rule to determine if it requires 'subjective' (nuanced, requires judgement) or 'semi-objective' (clear pattern matching but needs context) evaluation.
2. Create a clear, concise prompt body that instructs an LLM how to check for this rule.
3. Define criteria with weights. Total weight usually sums to 10 or 100, but for single rule it can be just the weight of that rule (e.g. 1-10).
4. If subjective, create a 1-4 rubric where 4 is perfect adherence and 1 is a severe violation.
5. Use the provided examples to guide the prompt generation.

Output the result in the specified JSON format.
`;
    }

    /**
     * Format the LLM output into a Markdown file content
     */
    private formatEval(rule: StyleGuideRule, output: EvalGenerationOutput): GeneratedEval {
        const severity = rule.severity || this.options.defaultSeverity || 'warning';

        // YAML Frontmatter
        let content = `---
evaluator: base
type: ${output.evaluationType}
id: ${rule.id}
name: ${rule.id.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
severity: ${severity}
`;

        if (output.criteria && output.criteria.length > 0) {
            content += `criteria:\n`;
            output.criteria.forEach(c => {
                content += `  - name: ${c.name}\n`;
                content += `    id: ${c.id}\n`;
                content += `    weight: ${c.weight}\n`;
            });
        }

        content += `---\n\n`;
        content += `${output.promptBody}\n\n`;

        if (output.criteria) {
            output.criteria.forEach(c => {
                if (c.rubric) {
                    content += `## Rubric for ${c.name}\n\n`;
                    c.rubric.forEach(r => {
                        content += `- **${r.score} (${r.label})**: ${r.description}\n`;
                    });
                    content += `\n`;
                }
            });
        }

        return {
            filename: `${rule.id}.md`,
            content,
            meta: {
                id: rule.id,
                name: rule.id,
                severity,
                type: output.evaluationType,
            }
        };
    }
}
