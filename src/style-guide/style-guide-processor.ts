import { readFileSync } from 'fs';
import * as path from 'path';
import { LLMProvider } from '../providers/llm-provider';
import { ParsedStyleGuide, STYLE_GUIDE_SCHEMA } from '../schemas/style-guide-schemas';
import { ProcessingError, ConfigError, ValidationError } from '../errors/index';
import { zodToJsonSchema } from 'zod-to-json-schema';
import {
    CATEGORY_EXTRACTION_SCHEMA,
    CategoryExtractionOutput,
    CATEGORY_RULE_GENERATION_SCHEMA,
    CategoryRuleGenerationOutput
} from '../schemas/style-guide-schemas';
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
        // 1. Read and parse the style guide file
        const styleGuide = this.readStyleGuide(filePath);

        if (this.options.verbose) {
            console.log(`[StyleGuideProcessor] Loaded style guide: ${styleGuide.name}`);
        }

        // 2. Process the style guide content
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

            // Validate against schema
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
        const filterTerm = this.options.filterRule!;

        if (this.options.verbose) {
            console.log(`[StyleGuideProcessor] Using LLM to find rules related to "${filterTerm}"`);
            console.log(`[StyleGuideProcessor] Passing raw style guide content for semantic matching`);
        }

        const prompt = this.buildSingleRulePrompt(styleGuide, filterTerm);

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

            // Ensure we return exactly ONE category
            if (result.categories.length > 1) {
                const firstCategory = result.categories[0];
                if (firstCategory) {
                    result.categories = [firstCategory];
                }
            }

            if (result.categories.length === 0) {
                throw new ProcessingError(
                    `LLM could not find rules related to "${filterTerm}" in the style guide`
                );
            }

            if (this.options.verbose) {
                const cat = result.categories[0];
                console.log(`[StyleGuideProcessor] LLM extracted category: "${cat?.name}" with ${cat?.rules.length} rules`);
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

    private buildSingleRulePrompt(styleGuide: ParsedStyleGuide, filterTerm: string): string {
        return `
            You are an expert in analyzing style guides and creating content evaluation prompts.

            The user wants to generate an evaluation for a SPECIFIC topic: "${filterTerm}"

            Your task:
            1. Analyze the ENTIRE style guide provided as context
            2. Semantically identify ALL rules that relate to "${filterTerm}" (understand synonyms, related concepts, abbreviations like "pov" = "point of view" = "second person")
            3. Create EXACTLY ONE category that consolidates all related rules into a single cohesive evaluation
            4. Name the category based on the topic (e.g., if "${filterTerm}" is about voice/perspective, name it accordingly)
            5. Create a PascalCase ID for the category (e.g., "VoiceSecondPerson", "ToneFormality")
            6. Classify it as subjective, semi-objective, or objective based on the rule nature
            7. Include ALL semantically matching rules under this single category

            IMPORTANT:
            - Use semantic understanding, not just string matching
            - "${filterTerm}" may be an abbreviation (pov, cta, seo) - understand what it means
            - Look for rules that are RELATED to the topic, even if they don't use the exact term

            Style Guide Name: ${styleGuide.name}

            Analyze the style guide content and create ONE category covering the "${filterTerm}" topic.
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

            Analyze the style guide content and output categories based on what you find.
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
