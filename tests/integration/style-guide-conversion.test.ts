import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StyleGuideParser } from '../../src/style-guide/style-guide-parser';
import { RuleGenerator } from '../../src/style-guide/rule-generator';
import { LLMProvider } from '../../src/providers/llm-provider';
import * as path from 'path';
import * as fs from 'fs';

// Mock LLM Provider
class MockLLMProvider implements LLMProvider {
    async runPromptStructured<T>(
        content: string,
        promptText: string,
        schema: { name: string; schema: Record<string, unknown> }
    ): Promise<T> {
        // Return a dummy response matching the schema
        return {
            evaluationType: 'subjective',
            promptBody: 'Check if the content follows the rule.',
            criteria: [
                {
                    name: 'Adherence',
                    id: 'adherence',
                    weight: 10,
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

    it('should convert a markdown style guide to rule files', async () => {
        // 1. Parse Style Guide
        const parser = new StyleGuideParser();
        const styleGuidePath = path.join(fixturesDir, 'sample-style-guide.md');
        const styleGuide = parser.parse(styleGuidePath);

        expect(styleGuide.data.rules.length).toBeGreaterThan(0);

        // 2. Generate Rules
        const mockProvider = new MockLLMProvider();
        const generator = new RuleGenerator({
            llmProvider: mockProvider,
            defaultSeverity: 'warning'
        });

        const rules = await generator.generateRulesFromStyleGuide(styleGuide.data);

        expect(rules.length).toBe(styleGuide.data.rules.length);

        // 3. Write Files
        for (const rule of rules) {
            const filePath = path.join(outputDir, rule.filename);
            fs.writeFileSync(filePath, rule.content, 'utf-8');
        }

        // 4. Verify Files Exist
        const files = fs.readdirSync(outputDir);
        expect(files.length).toBe(rules.length);

        // 5. Verify Content
        const firstFile = fs.readFileSync(path.join(outputDir, files[0]), 'utf-8');
        expect(firstFile).toContain('evaluator: base');
        expect(firstFile).toContain('type: subjective');
    });
});
