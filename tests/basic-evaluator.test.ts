import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BasicEvaluator } from '../src/evaluators/basic-evaluator';
import type { LLMProvider } from '../src/providers/llm-provider';
import type { PromptFile } from '../src/schemas/prompt-schemas';
import type { BasicResult } from '../src/prompts/schema';

// Mock LLMProvider
const MOCK_RUN_PROMPT_STRUCTURED = vi.fn();
const MOCK_LLM_PROVIDER = {
    runPromptStructured: MOCK_RUN_PROMPT_STRUCTURED,
} as unknown as LLMProvider;

describe('BasicEvaluator', () => {
    beforeEach(() => {
        MOCK_RUN_PROMPT_STRUCTURED.mockReset();
    });

    it('should construct a system prompt with the user instruction', async () => {
        const prompt: PromptFile = {
            id: 'test-prompt',
            filename: 'test.md',
            fullPath: '/path/to/test.md',
            meta: {
                evaluator: 'basic',
                id: 'test-prompt',
                name: 'Test Prompt',
                criteria: [],
            },
            body: 'Check for grammar issues',
        };

        const evaluator = new BasicEvaluator(MOCK_LLM_PROVIDER, prompt);
        const content = 'This is some content.';

        const mockResult: BasicResult = {
            status: 'ok',
            message: 'Good grammar',
            violations: [],
        };

        MOCK_RUN_PROMPT_STRUCTURED.mockResolvedValue(mockResult);

        const result = await evaluator.evaluate('test-file.md', content);

        expect(result).toEqual(mockResult);
        expect(MOCK_RUN_PROMPT_STRUCTURED).toHaveBeenCalledTimes(1);

        // Check that the system prompt contains the user's instruction
        const callArgs = MOCK_RUN_PROMPT_STRUCTURED.mock.calls[0] as [string, string, object];
        const systemPrompt = callArgs[1];
        expect(systemPrompt).toContain('Check for grammar issues');
        expect(systemPrompt).toContain('You must output your evaluation in the specific JSON format requested');
    });
});
