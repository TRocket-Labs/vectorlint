import Handlebars from 'handlebars';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { EvalGenerationOutput } from './eval-generation-schema';
import { StyleGuideRule } from '../schemas/style-guide-schemas';

export interface TemplateContext {
    EVALUATION_TYPE: string;
    RULE_ID: string;
    RULE_NAME: string;
    SEVERITY: string;
    PROMPT_BODY: string;
    CRITERIA?: Array<{
        name: string;
        id: string;
        weight: number;
    }> | undefined;
    RUBRIC?: string | undefined;
    [key: string]: unknown;
}

export class TemplateRenderer {
    private templateDir: string;

    constructor(templateDir?: string) {
        this.templateDir = templateDir || join(__dirname, 'templates');
        this.registerHelpers();
    }

    /**
     * Register Handlebars helpers
     */
    private registerHelpers(): void {
        Handlebars.registerHelper('uppercase', (str: string) => str.toUpperCase());
        Handlebars.registerHelper('lowercase', (str: string) => str.toLowerCase());
    }

    /**
     * Render a template with the given context
     */
    public render(templateName: string, context: TemplateContext): string {
        const templatePath = join(this.templateDir, templateName);

        if (!existsSync(templatePath)) {
            throw new Error(`Template not found: ${templatePath}`);
        }

        const templateContent = readFileSync(templatePath, 'utf-8');
        const template = Handlebars.compile(templateContent);

        return template(context);
    }

    /**
     * Create context from rule and LLM output
     */
    public createContext(
        rule: StyleGuideRule,
        output: EvalGenerationOutput,
        defaultSeverity: string
    ): TemplateContext {
        const severity = rule.severity || defaultSeverity;
        const ruleName = rule.id
            .replace(/-/g, ' ')
            .replace(/\b\w/g, (l) => l.toUpperCase());

        let rubricStr = '';
        if (output.criteria) {
            output.criteria.forEach(c => {
                if (c.rubric) {
                    rubricStr += `## Rubric for ${c.name}\n\n`;
                    c.rubric.forEach(r => {
                        rubricStr += `- **${r.score} (${r.label})**: ${r.description}\n`;
                    });
                    rubricStr += `\n`;
                }
            });
        }

        return {
            EVALUATION_TYPE: output.evaluationType,
            RULE_ID: rule.id,
            RULE_NAME: ruleName,
            SEVERITY: severity,
            PROMPT_BODY: output.promptBody,
            CRITERIA: output.criteria?.map(c => ({
                name: c.name,
                id: c.id,
                weight: c.weight
            })),
            RUBRIC: rubricStr.trim()
        };
    }
}
