import { describe, it, expect, vi } from 'vitest';
import {
  SuggestionPhaseRunner,
  type Suggestion,
  type SuggestionResult,
} from '../src/evaluators/suggestion-phase';
import type { RawDetectionIssue } from '../src/evaluators/detection-phase';

describe('SuggestionPhaseRunner', () => {
  // Mock LLM provider for testing
  const createMockProvider = (response: {
    suggestions: Array<{ issueIndex: number; suggestion: string; explanation: string }>;
  }) => ({
    runPromptStructured: vi.fn().mockResolvedValue({
      data: response,
      usage: { inputTokens: 200, outputTokens: 100 },
    }),
  });

  // Sample detected issues for testing
  const sampleIssues: RawDetectionIssue[] = [
    {
      quotedText: 'The data was processed by the system',
      contextBefore: 'We ran the experiments and',
      contextAfter: ', which took about 5 seconds to complete.',
      line: 42,
      criterionName: 'Avoid passive voice',
      analysis: 'This sentence uses passive voice ("was processed") instead of active voice.',
    },
    {
      quotedText: 'utilize',
      contextBefore: 'We should',
      contextAfter: 'the available resources efficiently.',
      line: 17,
      criterionName: 'Use simple vocabulary',
      analysis: '"Utilize" is unnecessarily complex. Use "use" instead.',
    },
    {
      quotedText: 'In order to',
      contextBefore: '',
      contextAfter: 'start the process, press the button.',
      line: 5,
      criterionName: 'Avoid wordy phrases',
      analysis: '"In order to" is wordy. Use "To" instead.',
    },
  ];

  describe('run method', () => {
    it('should call LLM provider with content and built prompt', async () => {
      const mockResponse = {
        suggestions: [
          {
            issueIndex: 1,
            suggestion: 'The system processed the data',
            explanation: 'Changed to active voice',
          },
        ],
      };
      const mockProvider = createMockProvider(mockResponse);
      const runner = new SuggestionPhaseRunner(mockProvider);

      await runner.run('Full document content', sampleIssues, 'Evaluation criteria');

      expect(mockProvider.runPromptStructured).toHaveBeenCalledWith(
        'Full document content',
        expect.stringContaining('Full document content'),
        expect.objectContaining({
          name: 'vectorlint_suggestion_result',
        })
      );
    });

    it('should return suggestion result with mapped suggestions', async () => {
      const mockResponse = {
        suggestions: [
          {
            issueIndex: 1,
            suggestion: 'The system processed the data',
            explanation: 'Changed to active voice',
          },
          {
            issueIndex: 2,
            suggestion: 'use',
            explanation: 'Simpler alternative',
          },
        ],
      };
      const mockProvider = createMockProvider(mockResponse);
      const runner = new SuggestionPhaseRunner(mockProvider);

      const result = await runner.run('Content', sampleIssues.slice(0, 2), 'Criteria');

      expect(result.suggestions).toHaveLength(2);
      expect(result.suggestions[0]).toEqual({
        issueIndex: 1,
        suggestion: 'The system processed the data',
        explanation: 'Changed to active voice',
      });
      expect(result.suggestions[1]).toEqual({
        issueIndex: 2,
        suggestion: 'use',
        explanation: 'Simpler alternative',
      });
      expect(result.hasSuggestions).toBe(true);
      expect(result.usage).toEqual({ inputTokens: 200, outputTokens: 100 });
    });

    it('should return hasSuggestions false when no suggestions returned', async () => {
      const mockResponse = { suggestions: [] };
      const mockProvider = createMockProvider(mockResponse);
      const runner = new SuggestionPhaseRunner(mockProvider);

      const result = await runner.run('Content', [], 'Criteria');

      expect(result.suggestions).toHaveLength(0);
      expect(result.hasSuggestions).toBe(false);
    });

    it('should use default maxRetries of 3 when not specified', async () => {
      const mockResponse = { suggestions: [] };
      const mockProvider = createMockProvider(mockResponse);
      const runner = new SuggestionPhaseRunner(mockProvider);

      await runner.run('Content', sampleIssues, 'Criteria');

      expect(mockProvider.runPromptStructured).toHaveBeenCalled();
    });
  });

  describe('formatIssues', () => {
    it('should format issues into markdown for prompt inclusion', () => {
      const mockProvider = createMockProvider({ suggestions: [] });
      const runner = new SuggestionPhaseRunner(mockProvider);

      // Access private method via type assertion for testing
      const formatted = (runner as unknown as { formatIssues: (i: RawDetectionIssue[]) => string }).formatIssues(sampleIssues);

      expect(formatted).toContain('## Issue 1');
      expect(formatted).toContain('The data was processed by the system');
      expect(formatted).toContain('## Issue 2');
      expect(formatted).toContain('utilize');
      expect(formatted).toContain('## Issue 3');
      expect(formatted).toContain('In order to');
    });

    it('should return "No issues found." for empty issues array', () => {
      const mockProvider = createMockProvider({ suggestions: [] });
      const runner = new SuggestionPhaseRunner(mockProvider);

      const formatted = (runner as unknown as { formatIssues: (i: RawDetectionIssue[]) => string }).formatIssues([]);

      expect(formatted).toBe('No issues found.');
    });
  });

  describe('Property 4: Suggestion-to-Issue Matching', () => {
    it('Property 4: Suggestions are correctly matched to issues by index (1-based)', async () => {
      const mockResponse = {
        suggestions: [
          {
            issueIndex: 1,
            suggestion: 'The system processed the data',
            explanation: 'Rewrite in active voice',
          },
          {
            issueIndex: 2,
            suggestion: 'use',
            explanation: 'Replace with simpler vocabulary',
          },
          {
            issueIndex: 3,
            suggestion: 'To',
            explanation: 'Remove wordy phrase',
          },
        ],
      };
      const mockProvider = createMockProvider(mockResponse);
      const runner = new SuggestionPhaseRunner(mockProvider);

      const result: SuggestionResult = await runner.run(
        'Full document content',
        sampleIssues,
        'Quality criteria'
      );

      // Verify all 3 suggestions were returned
      expect(result.suggestions).toHaveLength(3);

      // Verify Issue 1 suggestion matches correctly
      expect(result.suggestions[0].issueIndex).toBe(1);
      expect(result.suggestions[0].suggestion).toBe('The system processed the data');
      expect(result.suggestions[0].explanation).toBe('Rewrite in active voice');

      // Verify Issue 2 suggestion matches correctly
      expect(result.suggestions[1].issueIndex).toBe(2);
      expect(result.suggestions[1].suggestion).toBe('use');
      expect(result.suggestions[1].explanation).toBe('Replace with simpler vocabulary');

      // Verify Issue 3 suggestion matches correctly
      expect(result.suggestions[2].issueIndex).toBe(3);
      expect(result.suggestions[2].suggestion).toBe('To');
      expect(result.suggestions[2].explanation).toBe('Remove wordy phrase');
    });

    it('Property 4: Handles partial suggestion sets (some issues without suggestions)', async () => {
      const mockResponse = {
        suggestions: [
          {
            issueIndex: 1,
            suggestion: 'The system processed the data',
            explanation: 'Rewrite in active voice',
          },
          // Note: No suggestion for issueIndex: 2
          {
            issueIndex: 3,
            suggestion: 'To',
            explanation: 'Remove wordy phrase',
          },
        ],
      };
      const mockProvider = createMockProvider(mockResponse);
      const runner = new SuggestionPhaseRunner(mockProvider);

      const result: SuggestionResult = await runner.run(
        'Full document content',
        sampleIssues,
        'Quality criteria'
      );

      // Should return exactly what the LLM provided (2 suggestions, not 3)
      expect(result.suggestions).toHaveLength(2);

      // Verify the two suggestions are correctly indexed
      expect(result.suggestions[0].issueIndex).toBe(1);
      expect(result.suggestions[1].issueIndex).toBe(3);

      // Verify no suggestion with issueIndex: 2
      expect(result.suggestions.some((s: Suggestion) => s.issueIndex === 2)).toBe(false);
    });

    it('Property 4: Preserves suggestion order from LLM response', async () => {
      // LLM returns suggestions in non-sequential order
      const mockResponse = {
        suggestions: [
          {
            issueIndex: 3,
            suggestion: 'To',
            explanation: 'Remove wordy phrase',
          },
          {
            issueIndex: 1,
            suggestion: 'The system processed the data',
            explanation: 'Rewrite in active voice',
          },
          {
            issueIndex: 2,
            suggestion: 'use',
            explanation: 'Replace with simpler vocabulary',
          },
        ],
      };
      const mockProvider = createMockProvider(mockResponse);
      const runner = new SuggestionPhaseRunner(mockProvider);

      const result: SuggestionResult = await runner.run(
        'Full document content',
        sampleIssues,
        'Quality criteria'
      );

      // Should preserve LLM's order (3, 1, 2)
      expect(result.suggestions).toHaveLength(3);
      expect(result.suggestions[0].issueIndex).toBe(3);
      expect(result.suggestions[1].issueIndex).toBe(1);
      expect(result.suggestions[2].issueIndex).toBe(2);
    });

    it('Property 4: Handles single issue and suggestion correctly', async () => {
      const singleIssue: RawDetectionIssue[] = [
        {
          quotedText: 'very unique',
          contextBefore: 'This feature is',
          contextAfter: 'in the industry.',
          line: 10,
          criterionName: 'Avoid redundant modifiers',
          analysis: '"Unique" is absolute; "very" is redundant.',
        },
      ];

      const mockResponse = {
        suggestions: [
          {
            issueIndex: 1,
            suggestion: 'unique',
            explanation: 'Removed redundant "very" modifier',
          },
        ],
      };
      const mockProvider = createMockProvider(mockResponse);
      const runner = new SuggestionPhaseRunner(mockProvider);

      const result: SuggestionResult = await runner.run(
        'Content',
        singleIssue,
        'Criteria'
      );

      expect(result.suggestions).toHaveLength(1);
      expect(result.suggestions[0].issueIndex).toBe(1);
      expect(result.suggestions[0].suggestion).toBe('unique');
      expect(result.hasSuggestions).toBe(true);
    });

    it('Property 4: Empty issues array results in empty suggestions', async () => {
      const mockResponse = { suggestions: [] };
      const mockProvider = createMockProvider(mockResponse);
      const runner = new SuggestionPhaseRunner(mockProvider);

      const result: SuggestionResult = await runner.run('Content', [], 'Criteria');

      expect(result.suggestions).toHaveLength(0);
      expect(result.hasSuggestions).toBe(false);

      // Verify the prompt was built with "No issues found."
      expect(mockProvider.runPromptStructured).toHaveBeenCalledWith(
        'Content',
        expect.stringContaining('No issues found.'),
        expect.any(Object)
      );
    });

    it('Property 4: Suggestions contain all required fields with proper types', async () => {
      const mockResponse = {
        suggestions: [
          {
            issueIndex: 1,
            suggestion: 'Replacement text',
            explanation: 'Detailed explanation of the fix',
          },
        ],
      };
      const mockProvider = createMockProvider(mockResponse);
      const runner = new SuggestionPhaseRunner(mockProvider);

      const result: SuggestionResult = await runner.run(
        'Content',
        sampleIssues.slice(0, 1),
        'Criteria'
      );

      const suggestion = result.suggestions[0];

      // Verify all required fields are present
      expect(suggestion).toHaveProperty('issueIndex');
      expect(suggestion).toHaveProperty('suggestion');
      expect(suggestion).toHaveProperty('explanation');

      // Verify field types
      expect(typeof suggestion.issueIndex).toBe('number');
      expect(typeof suggestion.suggestion).toBe('string');
      expect(typeof suggestion.explanation).toBe('string');

      // Verify issueIndex is positive integer
      expect(suggestion.issueIndex).toBeGreaterThan(0);
      expect(Number.isInteger(suggestion.issueIndex)).toBe(true);
    });
  });

  describe('Zod Runtime Validation', () => {
    it('should throw ZodError when LLM returns malformed response (missing required field)', async () => {
      // Malformed response: missing 'explanation' field
      const malformedResponse = {
        suggestions: [
          {
            issueIndex: 1,
            suggestion: 'The system processed the data',
            // 'explanation' is missing
          },
        ],
      };
      const mockProvider = {
        runPromptStructured: vi.fn().mockResolvedValue({
          data: malformedResponse,
          usage: { inputTokens: 200, outputTokens: 100 },
        }),
      };
      const runner = new SuggestionPhaseRunner(mockProvider);

      await expect(
        runner.run('Content', sampleIssues.slice(0, 1), 'Criteria')
      ).rejects.toThrow();
    });

    it('should throw ZodError when LLM returns malformed response (wrong type)', async () => {
      // Malformed response: issueIndex is string instead of number
      const malformedResponse = {
        suggestions: [
          {
            issueIndex: '1' as unknown as number, // Wrong type
            suggestion: 'The system processed the data',
            explanation: 'Changed to active voice',
          },
        ],
      };
      const mockProvider = {
        runPromptStructured: vi.fn().mockResolvedValue({
          data: malformedResponse,
          usage: { inputTokens: 200, outputTokens: 100 },
        }),
      };
      const runner = new SuggestionPhaseRunner(mockProvider);

      await expect(
        runner.run('Content', sampleIssues.slice(0, 1), 'Criteria')
      ).rejects.toThrow();
    });

    it('should throw ZodError when LLM returns malformed response (zero or negative issueIndex)', async () => {
      // Malformed response: issueIndex is 0 (not positive)
      const malformedResponse = {
        suggestions: [
          {
            issueIndex: 0, // Not positive
            suggestion: 'The system processed the data',
            explanation: 'Changed to active voice',
          },
        ],
      };
      const mockProvider = {
        runPromptStructured: vi.fn().mockResolvedValue({
          data: malformedResponse,
          usage: { inputTokens: 200, outputTokens: 100 },
        }),
      };
      const runner = new SuggestionPhaseRunner(mockProvider);

      await expect(
        runner.run('Content', sampleIssues.slice(0, 1), 'Criteria')
      ).rejects.toThrow();
    });

    it('should throw ZodError when LLM returns malformed response (empty suggestion string)', async () => {
      // Malformed response: suggestion is empty string
      const malformedResponse = {
        suggestions: [
          {
            issueIndex: 1,
            suggestion: '', // Empty string
            explanation: 'Changed to active voice',
          },
        ],
      };
      const mockProvider = {
        runPromptStructured: vi.fn().mockResolvedValue({
          data: malformedResponse,
          usage: { inputTokens: 200, outputTokens: 100 },
        }),
      };
      const runner = new SuggestionPhaseRunner(mockProvider);

      await expect(
        runner.run('Content', sampleIssues.slice(0, 1), 'Criteria')
      ).rejects.toThrow();
    });
  });
});
