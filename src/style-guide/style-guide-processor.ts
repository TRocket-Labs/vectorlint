import { LLMProvider } from '../providers/llm-provider';
import { ParsedStyleGuide } from '../schemas/style-guide-schemas';
import { ProcessingError } from '../errors/index';
import { zodToJsonSchema } from 'zod-to-json-schema';
import {
    CATEGORY_EXTRACTION_SCHEMA,
    CategoryExtractionOutput,
    CATEGORY_RULE_GENERATION_SCHEMA,
    CategoryRuleGenerationOutput
} from '../schemas/category-schema';
import { TemplateRenderer } from './template-renderer';

export interface StyleGuideProcessorOptions {
    llmProvider: LLMProvider;
    // Extraction options
    maxCategories?: number | undefined;
    filterRule?: string | undefined;
    // Generation options
    templateDir?: string | undefined;
    defaultSeverity?: 'error' | 'warning' | undefined;
    strictness?: 'lenient' | 'standard' | 'strict' | undefined;
    verbose?: boolean | undefined;
}

export interface GeneratedCategoryRule {
    filename: string;
    content: string;
    meta: {
        id: string;
        name: string;
        categoryType: string;
        ruleCount: number;
    };
}

export class StyleGuideProcessor {
    private llmProvider: LLMProvider;
    private options: Required<Pick<StyleGuideProcessorOptions, 'maxCategories' | 'verbose' | 'defaultSeverity' | 'strictness'>> & Omit<StyleGuideProcessorOptions, 'llmProvider' | 'maxCategories' | 'verbose' | 'defaultSeverity' | 'strictness'>;
    private renderer: TemplateRenderer;

    constructor(options: StyleGuideProcessorOptions) {
        this.llmProvider = options.llmProvider;
        this.renderer = new TemplateRenderer(options.templateDir);
        this.options = {
            maxCategories: 10,
            verbose: false,
            defaultSeverity: 'warning',
            strictness: 'standard',
            ...options
        };
    }

    /**
     * Process a style guide: Extract categories and generate rules
     */
    public async process(styleGuide: ParsedStyleGuide): Promise<GeneratedCategoryRule[]> {
        // 1. Extract Categories (Organizer Role)
        const extractionOutput = await this.extractCategories(styleGuide);

        if (this.options.verbose) {
            console.log(`[StyleGuideProcessor] Extracted ${extractionOutput.categories.length} categories`);
        }

        // 2. Generate Rules (Author Role)
        return this.generateCategoryRules(extractionOutput);
    }

    /**
     * Extract and categorize rules from a parsed style guide
     */
    private async extractCategories(styleGuide: ParsedStyleGuide): Promise<CategoryExtractionOutput> {
        // If filterRule is specified, generate ONLY ONE category for that specific rule
        if (this.options.filterRule) {
            return this.extractSingleRule(styleGuide);
        }

        // Otherwise, do full category extraction
        return this.extractAllCategories(styleGuide);
    }

    private async extractSingleRule(styleGuide: ParsedStyleGuide): Promise<CategoryExtractionOutput> {
        const filterTerm = this.options.filterRule!.toLowerCase();

        // Find rules matching the filter
        const matchingRules = styleGuide.rules.filter(r =>
            r.description.toLowerCase().includes(filterTerm) ||
            r.id.toLowerCase().includes(filterTerm) ||
            r.category.toLowerCase().includes(filterTerm)
        );

        if (matchingRules.length === 0) {
            throw new ProcessingError(
                `No rules found matching filter: "${this.options.filterRule}" (context: category-extraction)`
            );
        }

        if (this.options.verbose) {
            console.log(`[StyleGuideProcessor] Found ${matchingRules.length} rules matching "${this.options.filterRule}"`);
            console.log(`[StyleGuideProcessor] Generating ONE consolidated eval for this rule`);
        }

        const prompt = this.buildSingleRulePrompt(styleGuide, matchingRules, filterTerm);

        try {
            const schemaJson = zodToJsonSchema(CATEGORY_EXTRACTION_SCHEMA);

            const result = await this.llmProvider.runPromptStructured<CategoryExtractionOutput>(
                JSON.stringify({ name: styleGuide.name, matchingRules }),
                prompt,
                {
                    name: 'singleRuleExtraction',
                    schema: schemaJson as Record<string, unknown>
                }
            );

            // Ensure we return exactly ONE category
            if (result.categories.length > 1) {
                const firstCategory = result.categories[0];
                if (firstCategory) {
                    result.categories = [firstCategory];
                }
            }

            if (result.categories.length === 0) {
                throw new ProcessingError(
                    `No category generated for rule: "${this.options.filterRule}" (context: category-extraction)`
                );
            }

            if (this.options.verbose) {
                console.log(`[StyleGuideProcessor] Extracted 1 category: "${result.categories[0]?.name}"`);
            }

            return result;
        } catch (error) {
            if (error instanceof ProcessingError) throw error;
            throw new ProcessingError(
                `Single rule extraction failed: ${(error as Error).message}`
            );
        }
    }

    private async extractAllCategories(styleGuide: ParsedStyleGuide): Promise<CategoryExtractionOutput> {
        const prompt = this.buildFullPrompt(styleGuide);

        try {
            const schemaJson = zodToJsonSchema(CATEGORY_EXTRACTION_SCHEMA);

            const result = await this.llmProvider.runPromptStructured<CategoryExtractionOutput>(
                JSON.stringify(styleGuide),
                prompt,
                {
                    name: 'categoryExtraction',
                    schema: schemaJson as Record<string, unknown>
                }
            );

            // Sort categories by priority (1=highest) and limit to maxCategories
            const sortedCategories = [...result.categories]
                .sort((a, b) => a.priority - b.priority)
                .slice(0, this.options.maxCategories);

            const finalResult: CategoryExtractionOutput = { categories: sortedCategories };

            if (this.options.verbose) {
                const totalRules = finalResult.categories.reduce((sum: number, cat) => sum + cat.rules.length, 0);
                console.log(`[StyleGuideProcessor] Extracted ${finalResult.categories.length} categories with ${totalRules} total rules`);
                finalResult.categories.forEach(cat => {
                    console.log(`  - ${cat.name} (priority: ${cat.priority}, ${cat.type}): ${cat.rules.length} rules`);
                });
            }

            return finalResult;
        } catch (error) {
            if (error instanceof ProcessingError) throw error;
            throw new ProcessingError(
                `Category extraction failed: ${(error as Error).message}`
            );
        }
    }

    /**
     * Generate category-level rules from extracted categories
     */
    private async generateCategoryRules(
        categories: CategoryExtractionOutput
    ): Promise<GeneratedCategoryRule[]> {
        const rules: GeneratedCategoryRule[] = [];
        let completed = 0;

        for (const category of categories.categories) {
            try {
                const generatedEval = await this.generateCategoryRule(category);
                rules.push(generatedEval);
                completed++;
                if (this.options.verbose) {
                    console.log(`[StyleGuideProcessor] Progress: ${completed}/${categories.categories.length} categories processed`);
                }
            } catch (error) {
                console.error(`Failed to generate eval for category ${category.id}:`, error);
                // Continue with other categories
            }
        }

        return rules;
    }

    private async generateCategoryRule(
        category: CategoryExtractionOutput['categories'][0]
    ): Promise<GeneratedCategoryRule> {
        const prompt = this.buildRulePrompt(category);

        try {
            const schemaJson = zodToJsonSchema(CATEGORY_RULE_GENERATION_SCHEMA);

            const result = await this.llmProvider.runPromptStructured<CategoryRuleGenerationOutput>(
                JSON.stringify(category),
                prompt,
                {
                    name: 'categoryRuleGeneration',
                    schema: schemaJson as Record<string, unknown>
                }
            );

            return this.formatCategoryRule(category, result);
        } catch (error) {
            throw new ProcessingError(
                `Category rule generation failed for ${category.id}: ${(error as Error).message}`
            );
        }
    }

    // --- Prompt Builders ---

    private buildSingleRulePrompt(styleGuide: ParsedStyleGuide, matchingRules: typeof styleGuide.rules, filterTerm: string): string {
        return `
You are an expert in creating content evaluation prompts from style guides.

The user wants to generate an evaluation for a SPECIFIC rule: "${filterTerm}"

I found these matching rules in the style guide:
${matchingRules.map((r, i) => `${i + 1}. ${r.description}`).join('\n')}

Your task:
1. Create EXACTLY ONE category that consolidates all matching rules into a single cohesive evaluation
2. Name the category based on what "${filterTerm}" refers to in the style guide
3. Create a PascalCase ID for the category (e.g., "VoiceSecondPersonPreferred")
4. Classify it as subjective, semi-objective, or objective based on the rule nature
5. Include ALL matching rules under this single category

DO NOT create multiple categories. Create exactly ONE category that covers the "${filterTerm}" topic.

Style Guide Name: ${styleGuide.name}
`;
    }

    private buildFullPrompt(styleGuide: ParsedStyleGuide): string {
        return `
You are an expert in analyzing style guides and organizing rules into logical categories.

Your task is to analyze the provided style guide and DYNAMICALLY identify categories based on the content.
DO NOT use predefined categories. Let the content guide what categories emerge naturally.

Instructions:
1. Read all the rules in the style guide
2. Identify natural thematic groupings (e.g., if many rules discuss tone, create a "Voice & Tone" category)
3. Create up to ${this.options.maxCategories} categories based on what you find
4. Classify each category as:
   - Subjective: Requires judgment (tone, style, clarity)
   - Semi-objective: Clear patterns but needs context (citations, evidence)
   - Objective: Can be mechanically checked (formatting, word count)
5. Assign priority (1=highest, 10=lowest) based on impact on content quality
6. Use PascalCase for all category IDs (e.g., "VoiceTone", "EvidenceCredibility")

Important:
- Categories should emerge from the ACTUAL content of the style guide
- Do not force rules into predefined buckets
- Each category should have 3-10 related rules
- Preserve original rule text and examples

Style Guide Name: ${styleGuide.name}
Total Rules: ${styleGuide.rules.length}

Analyze the style guide and output categories based on what you find.
`;
    }

    private buildRulePrompt(category: CategoryExtractionOutput['categories'][0]): string {
        return `
You are an expert in creating automated content evaluation prompts.

Your task is to create a comprehensive evaluation prompt that checks ALL rules in the "${category.name}" category.

Category: ${category.name}
Type: ${category.type}
Description: ${category.description}
Number of Rules: ${category.rules.length}

Rules to evaluate:
${category.rules.map((r, i) => `${i + 1}. ${r.description}`).join('\n')}

Strictness Level: ${this.options.strictness}

Instructions:
1. Create a single prompt that evaluates ALL rules in this category together
2. Each rule becomes a separate criterion with its own weight
3. Use PascalCase for all criterion IDs (e.g., "VoiceSecondPersonPreferred")
4. The prompt body should instruct the LLM to check all criteria
4. For ${category.type} evaluation, ${category.type === 'subjective' ? 'create 1-4 rubrics for each criterion' : 'provide clear pass/fail guidance'}
5. Total weight across all criteria should sum to 100
6. Use examples from the rules when available

Output a structured evaluation prompt that covers the entire category.
`;
    }

    // --- Helpers ---

    private formatCategoryRule(
        category: CategoryExtractionOutput['categories'][0],
        output: CategoryRuleGenerationOutput
    ): GeneratedCategoryRule {
        const defaultSeverity = this.options.defaultSeverity || 'warning';

        // Helpers for ID formatting
        const toKebabCase = (str: string) => str
            .replace(/([a-z])([A-Z])/g, '$1-$2')
            .replace(/[\s_]+/g, '-')
            .toLowerCase();

        // Use TemplateRenderer
        const context = this.renderer.createCategoryContext(category, output, defaultSeverity);
        const content = this.renderer.render('base-template.md', context);

        // Ensure filename is kebab-case even if ID is PascalCase
        const filenameId = toKebabCase(category.id);

        return {
            filename: `${filenameId}.md`,
            content,
            meta: {
                id: category.id,
                name: category.name,
                categoryType: category.type,
                ruleCount: category.rules.length,
            }
        };
    }
}
