import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BasicEvaluator } from '../src/evaluators/basic-evaluator';
import type { LLMProvider } from '../src/providers/llm-provider';
import type { PromptFile } from '../src/schemas/prompt-schemas';
import type { BasicResult } from '../src/prompts/schema';

// Mock LLMProvider
const mockRunPromptStructured = vi.fn();
const mockLLMProvider = {
    runPromptStructured: mockRunPromptStructured,
} as unknown as LLMProvider;

describe('BasicEvaluator', () => {
    beforeEach(() => {
        mockRunPromptStructured.mockReset();
    });

    it('should construct a system prompt with the user instruction', async () => {
        const prompt: PromptFile = {
            id: 'test-prompt',
            filename: 'test.md',
            fullPath: '/path/to/test.md',
            meta: {
                evaluator: 'basic',
                criteria: [],
            },
            body: 'Check for grammar issues',
        };

        const evaluator = new BasicEvaluator(mockLLMProvider, prompt);
        const content = 'This is some content.';

        const mockResult: BasicResult = {
            status: 'ok',
            message: 'Good grammar',
            violations: [],
        };

        mockRunPromptStructured.mockResolvedValue(mockResult);

        const result = await evaluator.evaluate('test-file.md', content);

        expect(result).toEqual(mockResult);
        expect(mockRunPromptStructured).toHaveBeenCalledTimes(1);

        // Check that the system prompt contains the user's instruction
        const callArgs = mockRunPromptStructured.mock.calls[0] as [string, string, object];
        const systemPrompt = callArgs[1];
        expect(systemPrompt).toContain('Check for grammar issues');
        expect(systemPrompt).toContain('You must output your evaluation in the specific JSON format requested');
    });
});
