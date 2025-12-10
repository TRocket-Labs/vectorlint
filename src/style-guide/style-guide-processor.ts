import { readFileSync } from 'fs';
import * as path from 'path';
import { LLMProvider } from '../providers/llm-provider';
import {
    ParsedStyleGuide,
    STYLE_GUIDE_SCHEMA,
    CATEGORY_EXTRACTION_SCHEMA,
    CategoryExtractionOutput,
    CATEGORY_RULE_GENERATION_SCHEMA,
    CategoryRuleGenerationOutput,
    TYPE_IDENTIFICATION_SCHEMA,
    TypeIdentificationOutput
} from '../schemas/style-guide-schemas';
import { ProcessingError, ConfigError, ValidationError } from '../errors/index';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { TemplateRenderer } from './template-renderer';
import { GeneratedCategoryRule, StyleGuideProcessorOptions, ResolvedProcessorOptions } from './types';

export class StyleGuideProcessor {
    private llmProvider: LLMProvider;
    private options: ResolvedProcessorOptions;
    private renderer: TemplateRenderer;

    constructor(options: StyleGuideProcessorOptions) {
        this.llmProvider = options.llmProvider;
        this.renderer = new TemplateRenderer(options.templateDir);
        this.options = {
            maxCategories: options.maxCategories ?? 10,
            verbose: options.verbose ?? false,
            defaultSeverity: options.defaultSeverity ?? 'warning',
            strictness: options.strictness ?? 'standard',
            filterRule: options.filterRule,
            templateDir: options.templateDir,
        };
    }

    /**
     * Process a style guide file: Read, extract categories, and generate rules
     */
    public async processFile(filePath: string): Promise<GeneratedCategoryRule[]> {
        const styleGuide = this.readStyleGuide(filePath);

        if (this.options.verbose) {
            console.log(`[StyleGuideProcessor] Loaded style guide: ${styleGuide.name}`);
        }

        return this.process(styleGuide);
    }

    /**
     * Read a style guide file and return parsed content
     */
    private readStyleGuide(filePath: string): ParsedStyleGuide {
        // Validate file extension
        const ext = path.extname(filePath).toLowerCase();
        if (ext !== '.md' && ext !== '.markdown') {
            throw new ConfigError(`Unsupported format: ${ext}. Only .md or .markdown files are supported.`);
        }

        try {
            const content = readFileSync(filePath, 'utf-8');
            const name = path.basename(filePath, path.extname(filePath));

            const result: ParsedStyleGuide = { name, content };

            STYLE_GUIDE_SCHEMA.parse(result);

            return result;
        } catch (error) {
            if (error instanceof ConfigError || error instanceof ValidationError) {
                throw error;
            }
            const err = error instanceof Error ? error : new Error(String(error));
            throw new ProcessingError(`Failed to read style guide: ${err.message}`);
        }
    }

    /**
     * Process a style guide: Identify types, extract categories, and generate rules
     */
    public async process(styleGuide: ParsedStyleGuide): Promise<GeneratedCategoryRule[]> {
        // Handle single rule extraction separately
        if (this.options.filterRule) {
            return this.processSingleRule(styleGuide);
        }

        // 1. Identify Types Strategy (Planner Role)
        const typeIdentification = await this.identifyTypes(styleGuide);

        if (this.options.verbose) {
            console.log(`[StyleGuideProcessor] Identified ${typeIdentification.types.length} evaluation types`);
        }

        const allCategories: CategoryExtractionOutput['categories'] = [];

        // 2. Extract Categories for each type (Organizer Role)
        for (const typeInfo of typeIdentification.types) {
            const categories = await this.extractCategoriesForType(styleGuide, typeInfo);
            allCategories.push(...categories.categories);
        }

        if (this.options.verbose) {
            console.log(`[StyleGuideProcessor] Extracted ${allCategories.length} total categories`);
        }

        // 3. Generate Rules (Author Role)
        return this.generateCategoryRules({ categories: allCategories });
    }

    /**
     * Process a single rule based on filter term
     */
    private async processSingleRule(styleGuide: ParsedStyleGuide): Promise<GeneratedCategoryRule[]> {
        const filterTerm = this.options.filterRule!;

        if (this.options.verbose) {
            console.log(`[StyleGuideProcessor] Processing single rule filter: "${filterTerm}"`);
        }

        const extractionOutput = await this.extractSingleRule(styleGuide, filterTerm);
        return this.generateCategoryRules(extractionOutput);
    }

    /**
     * Step 1: Identify evaluation types present in the style guide
     */
    private async identifyTypes(styleGuide: ParsedStyleGuide): Promise<TypeIdentificationOutput> {
        const prompt = this.buildTypeIdentificationPrompt(styleGuide);

        try {
            const schemaJson = zodToJsonSchema(TYPE_IDENTIFICATION_SCHEMA);

            return await this.llmProvider.runPromptStructured<TypeIdentificationOutput>(
                JSON.stringify(styleGuide),
                prompt,
                {
                    name: 'typeIdentification',
                    schema: schemaJson as Record<string, unknown>
                }
            );
        } catch (error) {
            throw new ProcessingError(`Type identification failed: ${(error as Error).message}`);
        }
    }

    /**
     * Step 2: Extract categories for a specific evaluation type
     */
    private async extractCategoriesForType(
        styleGuide: ParsedStyleGuide,
        typeInfo: TypeIdentificationOutput['types'][0]
    ): Promise<CategoryExtractionOutput> {
        const prompt = this.buildCategoryExtractionPrompt(styleGuide, typeInfo);

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

            // Ensure extracted categories match the requested type
            result.categories.forEach(cat => cat.type = typeInfo.type);

            return result;
        } catch (error) {
            console.warn(`Category extraction failed for type ${typeInfo.type}:`, error);
            return { categories: [] };
        }
    }


    private async extractSingleRule(styleGuide: ParsedStyleGuide, filterTerm: string): Promise<CategoryExtractionOutput> {
        const prompt = this.buildFilteredRulePrompt(styleGuide, filterTerm);

        try {
            const schemaJson = zodToJsonSchema(CATEGORY_EXTRACTION_SCHEMA);

            const result = await this.llmProvider.runPromptStructured<CategoryExtractionOutput>(
                JSON.stringify(styleGuide),
                prompt,
                {
                    name: 'singleRuleExtraction',
                    schema: schemaJson as Record<string, unknown>
                }
            );

            if (result.categories.length === 0) {
                throw new ProcessingError(
                    `LLM could not find rules related to "${filterTerm}" in the style guide`
                );
            }

            // Take only the first category if multiple returned
            return { categories: [result.categories[0]!] };

        } catch (error) {
            if (error instanceof ProcessingError) throw error;
            throw new ProcessingError(
                `Single rule extraction failed: ${(error as Error).message}`
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
        const prompt = this.buildRuleGenerationPrompt(category);

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

    private buildTypeIdentificationPrompt(styleGuide: ParsedStyleGuide): string {
        return `You are a **style guide planning agent**.

## Task
Analyze the style guide and identify which evaluation types are present.

## Evaluation Types
- **objective**: Formatting, structure, casing, specific disallowed words.
- **semi-objective**: Grammar, spelling, specific prohibited patterns, clear violations.
- **subjective**: Tone, voice, clarity, audience, engagement, flow.

## Output Requirements
- Identify **all** applicable types found in the content
- Estimate the number of rules for each type
- Provide the raw text of the rules belonging to each type

Style Guide: **${styleGuide.name}**`;
    }

    private buildCategoryExtractionPrompt(
        styleGuide: ParsedStyleGuide,
        typeInfo: TypeIdentificationOutput['types'][0]
    ): string {
        return `You are a **style guide rule categorizer** agent.

## Task
Extract and categorize rules specifically for the **${typeInfo.type}** evaluation type.

## Context
${typeInfo.description}
Raw Rules Text:
${typeInfo.rules.join('\n\n')}

## Type: ${typeInfo.type}
${typeInfo.type === 'subjective' ? '- Focus on tone, voice, clarity' : ''}
${typeInfo.type === 'semi-objective' ? '- Focus on repeatable patterns and clear violations' : ''}
${typeInfo.type === 'objective' ? '- Focus on formatting, structure, and existence checks' : ''}

## Output Requirements
- Create logical categories for these rules (e.g., "Voice & Tone", "Grammar", "Formatting")
- Use **PascalCase** for IDs
- Group related rules together (3-10 rules per category)
- Preserve original instructions

Style Guide: **${styleGuide.name}**`;
    }

    private buildFilteredRulePrompt(styleGuide: ParsedStyleGuide, filterTerm: string): string {
        return `You are a **style guide analyzer** designed to extract and categorize rules from style guides.

## Task

Analyze the provided style guide and extract all rules related to: **"${filterTerm}"**

## Output Requirements

- Create **exactly one** category that consolidates all related rules
- Use **PascalCase** for the category ID
- Classify as: **subjective**, **semi-objective**, or **objective**
- Include all semantically matching rules

## Guidelines

- Look for rules **related** to the topic, not just exact matches
- Consolidate similar rules into a cohesive category
- Preserve original rule text

Style Guide: **${styleGuide.name}**`;
    }

    private buildRuleGenerationPrompt(category: CategoryExtractionOutput['categories'][0]): string {
        return `You are an **evaluation prompt generator** designed to create content evaluation prompts.

## Task

Create a comprehensive evaluation prompt for the **"${category.name}"** category.

## Category Details

- **Name**: ${category.name}
- **Type**: ${category.type}
- **Description**: ${category.description}
- **Strictness**: ${this.options.strictness}

## Rules to Evaluate

${category.rules.map((r, i) => `${i + 1}. ${r.description}`).join('\n')}

## Output Requirements

- Each rule becomes a **separate criterion** with its own weight
- Use **PascalCase** for all criterion IDs
- Total weight must sum to **100**
${category.type === 'subjective' ? '- Create **1-4 rubric levels** for each criterion' : '- Provide **pass/fail** guidance for each criterion'}
- Include examples from rules when available`;
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
