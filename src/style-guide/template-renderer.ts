import Handlebars from 'handlebars';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { EvalGenerationOutput } from '../schemas/eval-generation-schema';
import { CategoryRuleGenerationOutput } from '../schemas/category-schema';
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
        if (templateDir) {
            this.templateDir = templateDir;
        } else {
            // ESM compatible __dirname
            const __filename = fileURLToPath(import.meta.url);
            const __dirname = dirname(__filename);
            this.templateDir = join(__dirname, 'templates');
        }
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
            RUBRIC: this.buildRubricString(output.criteria)
        };
    }

    /**
     * Create context from category and LLM output
     */
    public createCategoryContext(
        category: { id: string; name: string },
        output: CategoryRuleGenerationOutput,
        defaultSeverity: string
    ): TemplateContext {
        return {
            EVALUATION_TYPE: output.evaluationType,
            RULE_ID: category.id,
            RULE_NAME: category.name,
            SEVERITY: defaultSeverity,
            PROMPT_BODY: `# ${category.name}\n\n${output.promptBody}`,
            CRITERIA: output.criteria?.map(c => ({
                name: c.name,
                id: c.id,
                weight: c.weight
            })),
            RUBRIC: this.buildRubricString(output.criteria)
        };
    }

    private buildRubricString(criteria?: Array<{ name: string; rubric?: Array<{ score: number; label: string; description: string }> | undefined }>): string {
        let rubricStr = '';
        if (criteria) {
            criteria.forEach(c => {
                if (c.rubric) {
                    rubricStr += `## Rubric for ${c.name}\n\n`;
                    c.rubric.forEach(r => {
                        rubricStr += `- **${r.score} (${r.label})**: ${r.description}\n`;
                    });
                    rubricStr += `\n`;
                }
            });
        }
        return rubricStr.trim();
    }
}
