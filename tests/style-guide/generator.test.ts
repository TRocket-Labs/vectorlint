import { describe, it, expect, vi } from 'vitest';
import { EvalGenerator } from '../../src/style-guide/eval-generator';
import { LLMProvider } from '../../src/providers/llm-provider';
import { StyleGuideRule } from '../../src/schemas/style-guide-schemas';
import { EvalGenerationOutput } from '../../src/style-guide/eval-generation-schema';

// Mock LLM Provider
class MockLLMProvider implements LLMProvider {
    async runPromptStructured<T>(
        content: string,
        promptText: string,
        schema: { name: string; schema: Record<string, unknown> }
    ): Promise<T> {
        // Return a dummy response matching the schema
        const response: EvalGenerationOutput = {
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
        };
        return response as unknown as T;
    }
}

describe('EvalGenerator', () => {
    it('should generate an eval from a rule', async () => {
        const mockProvider = new MockLLMProvider();
        const generator = new EvalGenerator({ llmProvider: mockProvider });

        const rule: StyleGuideRule = {
            id: 'test-rule',
            category: 'tone',
            description: 'Use a friendly tone.',
            severity: 'warning'
        };

        const result = await generator.generateEval(rule);

        expect(result).toBeDefined();
        expect(result.filename).toBe('test-rule.md');
        expect(result.content).toContain('evaluator: base');
        expect(result.content).toContain('type: subjective');
        expect(result.content).toContain('id: test-rule');
        expect(result.content).toContain('severity: warning');
        expect(result.content).toContain('Check if the content follows the rule.');
        expect(result.content).toContain('## Rubric for Adherence');
    });

    it('should handle errors gracefully', async () => {
        const mockProvider = new MockLLMProvider();
        vi.spyOn(mockProvider, 'runPromptStructured').mockRejectedValue(new Error('LLM Error'));

        const generator = new EvalGenerator({ llmProvider: mockProvider });
        const rule: StyleGuideRule = {
            id: 'test-rule',
            category: 'tone',
            description: 'Use a friendly tone.'
        };

        await expect(generator.generateEval(rule)).rejects.toThrow('LLM generation failed: LLM Error');
    });
});
