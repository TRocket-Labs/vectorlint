import { describe, it, expect, vi } from 'vitest';
import { BaseEvaluator } from '../src/evaluators/base-evaluator';
import { EvaluationType } from '../src/evaluators/types';
import { LLMProvider, LLMResult } from '../src/providers/llm-provider';
import type { PromptFile } from '../src/schemas/prompt-schemas';
import type { SubjectiveLLMResult, SemiObjectiveLLMResult } from '../src/prompts/schema';
import type { SearchProvider } from '../src/providers/search-provider';

describe('Scoring Types', () => {
    const mockLlmProvider = {
        runPromptStructured: vi.fn(),
    } as unknown as LLMProvider;

    describe('Subjective Evaluation', () => {
        const subjectivePrompt: PromptFile = {
            id: 'test-subjective',
            filename: 'test.md',
            fullPath: '/test.md',
            body: 'Evaluate this.',
            meta: {
                id: 'test-subjective',
                name: 'Test Subjective',
                type: 'subjective',
                criteria: [
                    { id: 'c1', name: 'Criterion 1', weight: 50 },
                    { id: 'c2', name: 'Criterion 2', weight: 50 },
                ],
            },
        };

        it('should calculate weighted average correctly', async () => {
            const evaluator = new BaseEvaluator(mockLlmProvider, subjectivePrompt);


            // Mock LLM returning raw scores (0-4) wrapped in LLMResult
            const mockLlmResponse: LLMResult<SubjectiveLLMResult> = {
                data: {
                    criteria: [
                        {
                            name: 'Criterion 1',
                            score: 4, // 100%
                            summary: 'Good',
                            reasoning: 'Reason',
                            violations: []
                        },
                        {
                            name: 'Criterion 2',
                            score: 2, // 50%
                            summary: 'Okay',
                            reasoning: 'Reason',
                            violations: []
                        },
                    ],
                }
            };

            // eslint-disable-next-line @typescript-eslint/unbound-method
            const mockFn = vi.mocked(mockLlmProvider.runPromptStructured);
            mockFn.mockResolvedValueOnce(mockLlmResponse);

            const result = await evaluator.evaluate('file.md', 'content');

            if (result.type !== EvaluationType.SUBJECTIVE) throw new Error('Wrong result type');

            // Calculation:
            // C1: 10 (score 4) * 50 = 500
            // C2: 4 (score 2) * 50 = 200
            // Total: 700 / 100 = 7
            // Final Score: 7.0
            expect(result.final_score).toBe(7.0);
            expect(result.criteria[0]!.weighted_points).toBe(500);
            expect(result.criteria[1]!.weighted_points).toBe(200);
        });
    });

    describe('Semi-Objective Evaluation', () => {
        const semiObjectivePrompt: PromptFile = {
            id: 'test-semi',
            filename: 'test.md',
            fullPath: '/test.md',
            body: 'Count things.',
            meta: {
                id: 'test-semi',
                name: 'Test Semi',
                type: 'semi-objective',
            },
        };

        it('should calculate score correctly based on violation count', async () => {
            const evaluator = new BaseEvaluator(mockLlmProvider, semiObjectivePrompt);

            // Mock LLM returning violations only
            const mockLlmResponse: LLMResult<SemiObjectiveLLMResult> = {
                data: {
                    violations: [
                        { description: 'Issue 1', analysis: 'fail', suggestion: '', pre: '', post: '' },
                        { description: 'Issue 2', analysis: 'fail', suggestion: '', pre: '', post: '' },
                    ],
                }
            };

            // eslint-disable-next-line @typescript-eslint/unbound-method
            const mockFn = vi.mocked(mockLlmProvider.runPromptStructured);
            mockFn.mockResolvedValueOnce(mockLlmResponse);

            const content = new Array(100).fill('word').join(' ');
            const result = await evaluator.evaluate('file.md', content);

            if (result.type !== EvaluationType.SEMI_OBJECTIVE) throw new Error('Wrong result type');

            // Calculation: 2 violations = score of 8 (10 - 2)
            expect(result.final_score).toBe(8.0);
            expect(result.percentage).toBe(80);
            expect(result.passed_count).toBe(0);
            expect(result.total_count).toBe(2);
        });

        it('should handle empty violations list (perfect score)', async () => {
            const evaluator = new BaseEvaluator(mockLlmProvider, semiObjectivePrompt);

            const mockLlmResponse: LLMResult<SemiObjectiveLLMResult> = {
                data: {
                    violations: [],
                }
            };

            // eslint-disable-next-line @typescript-eslint/unbound-method
            const mockFn = vi.mocked(mockLlmProvider.runPromptStructured);
            mockFn.mockResolvedValueOnce(mockLlmResponse);

            const result = await evaluator.evaluate('file.md', 'content');

            if (result.type !== EvaluationType.SEMI_OBJECTIVE) throw new Error('Wrong result type');

            // No violations = perfect score
            expect(result.final_score).toBe(10);
            expect(result.percentage).toBe(100);
            expect(result.total_count).toBe(0);
        });
    });

    describe('Technical Accuracy Evaluator', () => {
        it('should return perfect score when no claims are found', async () => {
            // Dynamic import to avoid side effects or need for complex mocking setup at top level if possible
            // But we need to mock prompt-loader before importing the evaluator if it uses it at top level?
            // It uses it inside methods.

            // We need to mock getPrompt
            vi.mock('../src/evaluators/prompt-loader', () => ({
                getPrompt: vi.fn().mockReturnValue({ body: 'Extract claims' }),
            }));

            const { TechnicalAccuracyEvaluator } = await import('../src/evaluators/accuracy-evaluator');

            const mockSearchProvider: SearchProvider = {
                search: vi.fn().mockResolvedValue({ results: [] })
            };

            const prompt: PromptFile = {
                id: 'tech-acc',
                filename: 'tech.md',
                fullPath: '/tech.md',
                body: 'Check accuracy',
                meta: { id: 'tech-acc', name: 'Tech Acc', type: 'semi-objective' },
            };

            const evaluator = new TechnicalAccuracyEvaluator(mockLlmProvider, prompt, mockSearchProvider);

            // Mock claim extraction to return empty list
            // eslint-disable-next-line @typescript-eslint/unbound-method
            const mockFn = vi.mocked(mockLlmProvider.runPromptStructured);
            mockFn.mockResolvedValueOnce({ data: { claims: [] } } as unknown as LLMResult<any>);

            const result = await evaluator.evaluate('file.md', 'content');

            if (result.type !== EvaluationType.SEMI_OBJECTIVE) throw new Error('Wrong result type');
            expect(result.final_score).toBe(10);
            expect(result.items).toEqual([]);
        });
    });
});
