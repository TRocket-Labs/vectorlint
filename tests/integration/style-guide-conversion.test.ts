import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { StyleGuideProcessor } from '../../src/style-guide/style-guide-processor';
import { LLMProvider } from '../../src/providers/llm-provider';
import type { ParsedStyleGuide, CategoryExtractionOutput, CategoryRuleGenerationOutput } from '../../src/schemas/style-guide-schemas';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Mock LLM Provider that returns structured responses for category extraction and rule generation
 */
class MockLLMProvider implements LLMProvider {
    runPromptStructured<T>(
        content: string,
        promptText: string,
        schema: { name: string; schema: Record<string, unknown> }
    ): Promise<T> {
        // Category extraction call
        if (schema.name === 'categoryExtraction') {
            const categoryResult: CategoryExtractionOutput = {
                categories: [
                    {
                        id: 'VoiceTone',
                        name: 'Voice & Tone',
                        description: 'Guidelines for voice and tone',
                        type: 'subjective',
                        priority: 1,
                        rules: [
                            { description: 'Write in second person' },
                            { description: 'Use active voice' }
                        ]
                    }
                ]
            };
            return Promise.resolve(categoryResult as T);
        }

        // Category rule generation call
        const ruleResult: CategoryRuleGenerationOutput = {
            evaluationType: 'subjective',
            categoryName: 'Voice & Tone',
            promptBody: 'Evaluate the content for voice and tone adherence.',
            criteria: [
                {
                    name: 'Second Person Voice',
                    id: 'SecondPersonVoice',
                    weight: 50,
                    rubric: [
                        { score: 4, label: 'Excellent', description: 'Consistent second person usage' },
                        { score: 1, label: 'Poor', description: 'No second person usage' }
                    ]
                },
                {
                    name: 'Active Voice',
                    id: 'ActiveVoice',
                    weight: 50,
                    rubric: [
                        { score: 4, label: 'Excellent', description: 'Strong active voice throughout' },
                        { score: 1, label: 'Poor', description: 'Predominantly passive voice' }
                    ]
                }
            ]
        };
        return Promise.resolve(ruleResult as T);
    }
}

describe('Style Guide Conversion Integration', () => {
    const fixturesDir = path.join(__dirname, '../style-guide/fixtures');
    const outputDir = path.join(__dirname, 'temp-rules');

    beforeEach(() => {
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }
    });

    afterEach(() => {
        // Clean up output directory
        if (fs.existsSync(outputDir)) {
            fs.rmSync(outputDir, { recursive: true, force: true });
        }
    });

    it('should convert a markdown style guide to category-based rule files', async () => {
        const styleGuidePath = path.join(fixturesDir, 'sample-style-guide.md');

        // Skip test if fixture doesn't exist
        if (!fs.existsSync(styleGuidePath)) {
            console.log('[SKIP] sample-style-guide.md fixture not found');
            return;
        }

        // 1. Create processor with mock LLM provider
        const mockProvider = new MockLLMProvider();
        const processor = new StyleGuideProcessor({
            llmProvider: mockProvider,
            maxCategories: 10,
            defaultSeverity: 'warning',
            verbose: false,
        });

        // 2. Process the style guide file directly
        const rules = await processor.processFile(styleGuidePath);

        // Expect at least one category-based rule
        expect(rules.length).toBeGreaterThan(0);

        // 3. Write Files
        for (const rule of rules) {
            const filePath = path.join(outputDir, rule.filename);
            fs.writeFileSync(filePath, rule.content, 'utf-8');
        }

        // 4. Verify Files Exist
        const files = fs.readdirSync(outputDir);
        expect(files.length).toBe(rules.length);

        // 5. Verify Content
        const firstFile = fs.readFileSync(path.join(outputDir, files[0]!), 'utf-8');
        expect(firstFile).toContain('evaluator: base');
        expect(firstFile).toContain('type: subjective');
    });

    it('should process a style guide object with process method', async () => {
        const mockProvider = new MockLLMProvider();
        const processor = new StyleGuideProcessor({
            llmProvider: mockProvider,
            maxCategories: 5,
            verbose: false,
        });

        // Create a ParsedStyleGuide object directly
        const styleGuide: ParsedStyleGuide = {
            name: 'Test Style Guide',
            content: '# Test Guide\n\nUse second person (you/your).\nPrefer active voice over passive voice.'
        };

        // Process the style guide
        const rules = await processor.process(styleGuide);

        expect(rules.length).toBe(1);
        expect(rules[0]?.meta.id).toBe('VoiceTone');
        expect(rules[0]?.meta.name).toBe('Voice & Tone');
        expect(rules[0]?.meta.categoryType).toBe('subjective');
        expect(rules[0]?.meta.ruleCount).toBe(2);
        expect(rules[0]?.filename).toBe('voice-tone.md');
    });
});
