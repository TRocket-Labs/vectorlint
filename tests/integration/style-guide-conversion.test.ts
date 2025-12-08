import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StyleGuideParser } from '../../src/style-guide/style-guide-parser';
import { StyleGuideProcessor } from '../../src/style-guide/style-guide-processor';
import { LLMProvider } from '../../src/providers/llm-provider';
import * as path from 'path';
import * as fs from 'fs';

// Mock LLM Provider that handles both category extraction and rule generation
class MockLLMProvider implements LLMProvider {
    private callCount = 0;

    async runPromptStructured<T>(
        content: string,
        promptText: string,
        schema: { name: string; schema: Record<string, unknown> }
    ): Promise<T> {
        this.callCount++;

        // First call: category extraction
        if (schema.name === 'categoryExtraction') {
            return {
                categories: [
                    {
                        id: 'VoiceTone',
                        name: 'Voice & Tone',
                        description: 'Guidelines for voice and tone',
                        type: 'subjective',
                        priority: 1,
                        rules: [
                            { id: 'rule-1', description: 'Write in second person' },
                            { id: 'rule-2', description: 'Use active voice' }
                        ]
                    }
                ]
            } as unknown as T;
        }

        // Second call: rule generation
        return {
            evaluationType: 'subjective',
            promptBody: 'Check if the content follows the rule.',
            criteria: [
                {
                    name: 'Adherence',
                    id: 'Adherence',
                    weight: 100,
                    rubric: [
                        { score: 4, label: 'Excellent', description: 'Perfect adherence' },
                        { score: 1, label: 'Poor', description: 'Severe violation' }
                    ]
                }
            ]
        } as unknown as T;
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
        // 1. Parse Style Guide
        const parser = new StyleGuideParser();
        const styleGuidePath = path.join(fixturesDir, 'sample-style-guide.md');
        const styleGuide = parser.parse(styleGuidePath);

        expect(styleGuide.data.rules.length).toBeGreaterThan(0);

        // 2. Process Style Guide (extract categories + generate rules)
        const mockProvider = new MockLLMProvider();
        const processor = new StyleGuideProcessor({
            llmProvider: mockProvider,
            maxCategories: 10,
            defaultSeverity: 'warning',
            verbose: false,
        });

        const rules = await processor.process(styleGuide.data);

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
});

