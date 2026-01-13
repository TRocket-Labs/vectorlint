import { describe, it, expect, vi, beforeEach } from "vitest";
import { BaseEvaluator } from "../src/evaluators/base-evaluator";
import { EvaluationType } from "../src/evaluators/types";
import type { LLMProvider, LLMResult } from "../src/providers/llm-provider";
import type { PromptFile } from "../src/schemas/prompt-schemas";
import type {
  JudgeLLMResult,
  CheckLLMResult,
} from "../src/prompts/schema";
import type { SearchProvider } from "../src/providers/search-provider";

describe("Scoring Types", () => {
  const mockLlmProvider = {
    runPromptStructured: vi.fn(),
    runPromptUnstructured: vi.fn(),
  } as unknown as LLMProvider;

  beforeEach(() => {
    // Clear mock call history but preserve implementations
    vi.mocked(mockLlmProvider.runPromptStructured).mockClear();
    vi.mocked(mockLlmProvider.runPromptUnstructured).mockClear();
  });

  describe("Judge Evaluation", () => {
    const judgePrompt: PromptFile = {
      id: "test-judge",
      filename: "test.md",
      fullPath: "/test.md",
      body: "Evaluate this.",
      pack: "test",
      meta: {
        id: "test-judge",
        name: "Test Judge",
        type: "judge",
        criteria: [
          { id: "c1", name: "Criterion 1", weight: 50 },
          { id: "c2", name: "Criterion 2", weight: 50 },
        ],
      },
    };

    it("should calculate weighted average correctly", async () => {
      const evaluator = new BaseEvaluator(mockLlmProvider, judgePrompt);

      // Mock detection phase returning issues for each criterion
      const mockUnstructured = vi.mocked(mockLlmProvider.runPromptUnstructured);
      mockUnstructured.mockResolvedValue({
        data: `## Issue 1

**quotedText:**
> Issue 1 text

**contextBefore:**
before

**contextAfter:**
after

**line:** 1

**criterionName:** Criterion 1

**analysis:**
First issue found

## Issue 2

**quotedText:**
> Issue 2 text

**contextBefore:**
before

**contextAfter:**
after

**line:** 2

**criterionName:** Criterion 2

**analysis:**
Second issue found

## Issue 3

**quotedText:**
> Issue 3 text

**contextBefore:**
before

**contextAfter:**
after

**line:** 3

**criterionName:** Criterion 1

**analysis:**
Third issue found`,
        usage: { inputTokens: 100, outputTokens: 50 },
      });

      // Mock suggestion phase
      const mockStructured = vi.mocked(mockLlmProvider.runPromptStructured);
      mockStructured.mockResolvedValue({
        data: {
          suggestions: [
            {
              issueIndex: 1,
              suggestion: "Fix for issue 1",
              explanation: "Explanation 1",
            },
            {
              issueIndex: 2,
              suggestion: "Fix for issue 2",
              explanation: "Explanation 2",
            },
            {
              issueIndex: 3,
              suggestion: "Fix for issue 3",
              explanation: "Explanation 3",
            },
          ],
        },
      });

      const result = await evaluator.evaluate("file.md", "content");

      if (result.type !== EvaluationType.JUDGE)
        throw new Error("Wrong result type");

      // Criterion 1: 2 violations -> score decreases
      // Criterion 2: 1 violation -> score decreases
      // Both criteria have weight 50
      expect(result.final_score).toBeLessThan(10);
      expect(result.final_score).toBeGreaterThan(0);
      expect(result.criteria).toHaveLength(2);
      expect(result.criteria[0]!.name).toBe("Criterion 1");
      expect(result.criteria[1]!.name).toBe("Criterion 2");
    });

    it("should return perfect score when no issues found", async () => {
      const evaluator = new BaseEvaluator(mockLlmProvider, judgePrompt);

      // Mock detection phase returning no issues
      const mockUnstructured = vi.mocked(mockLlmProvider.runPromptUnstructured);
      mockUnstructured.mockResolvedValue({
        data: "No issues found.",
        usage: { inputTokens: 100, outputTokens: 50 },
      });

      // Suggestion phase should not be called
      const mockStructured = vi.mocked(mockLlmProvider.runPromptStructured);

      const result = await evaluator.evaluate("file.md", "content");

      if (result.type !== EvaluationType.JUDGE)
        throw new Error("Wrong result type");

      // No issues = perfect score
      expect(result.final_score).toBe(10);
      expect(mockStructured).not.toHaveBeenCalled();
    });
  });

  describe("Check Evaluation", () => {
    const checkPrompt: PromptFile = {
      id: "test-check",
      filename: "test.md",
      fullPath: "/test.md",
      body: "Count things.",
      pack: "test",
      meta: {
        id: "test-check",
        name: "Test Check",
        type: "check",
      },
    };

    it("should calculate score correctly based on violation count", async () => {
      const evaluator = new BaseEvaluator(mockLlmProvider, checkPrompt);

      // Mock detection phase returning issues
      const mockUnstructured = vi.mocked(mockLlmProvider.runPromptUnstructured);
      mockUnstructured.mockResolvedValue({
        data: `## Issue 1

**quotedText:**
> Issue 1 text

**contextBefore:**
before

**contextAfter:**
after

**line:** 1

**criterionName:** test-check

**analysis:**
First issue found

## Issue 2

**quotedText:**
> Issue 2 text

**contextBefore:**
before

**contextAfter:**
after

**line:** 2

**criterionName:** test-check

**analysis:**
Second issue found`,
        usage: { inputTokens: 100, outputTokens: 50 },
      });

      // Mock suggestion phase
      const mockStructured = vi.mocked(mockLlmProvider.runPromptStructured);
      mockStructured.mockResolvedValue({
        data: {
          suggestions: [
            {
              issueIndex: 1,
              suggestion: "Fix for issue 1",
              explanation: "Explanation 1",
            },
            {
              issueIndex: 2,
              suggestion: "Fix for issue 2",
              explanation: "Explanation 2",
            },
          ],
        },
      });

      const content = new Array(100).fill("word").join(" ");
      const result = await evaluator.evaluate("file.md", content);

      if (result.type !== EvaluationType.CHECK)
        throw new Error("Wrong result type");

      // Calculation: 2 violations / 100 words * strictness(1) = 2 violations per 100 words
      // score = 10 - (2 * 2) = 6
      expect(result.final_score).toBe(6.0);
      expect(result.percentage).toBe(60);
      expect(result.violation_count).toBe(2);
    });

    it("should handle empty violations list (perfect score)", async () => {
      const evaluator = new BaseEvaluator(mockLlmProvider, checkPrompt);

      // Mock detection phase returning no issues
      const mockUnstructured = vi.mocked(mockLlmProvider.runPromptUnstructured);
      mockUnstructured.mockResolvedValue({
        data: "No issues found.",
        usage: { inputTokens: 100, outputTokens: 50 },
      });

      // Suggestion phase should not be called when no issues are detected
      const mockStructured = vi.mocked(mockLlmProvider.runPromptStructured);

      const result = await evaluator.evaluate("file.md", "content");

      if (result.type !== EvaluationType.CHECK)
        throw new Error("Wrong result type");

      // No violations = perfect score
      expect(result.final_score).toBe(10);
      expect(result.percentage).toBe(100);
      expect(result.violation_count).toBe(0);

      // Suggestion phase should not have been called
      expect(mockStructured).not.toHaveBeenCalled();
    });
  });

  describe("Technical Accuracy Evaluator", () => {
    it("should return perfect score when no claims are found", async () => {
      // Reset modules to ensure clean state for test-scoped mocking
      vi.resetModules();

      // Mock prompt-loader for this test only
      vi.doMock("../src/evaluators/prompt-loader", () => ({
        getPrompt: vi.fn().mockReturnValue({ body: "Extract claims" }),
      }));

      const { TechnicalAccuracyEvaluator } = await import(
        "../src/evaluators/accuracy-evaluator"
      );

      const mockSearchProvider: SearchProvider = {
        search: vi.fn().mockResolvedValue({ results: [] }),
      };

      const prompt: PromptFile = {
        id: "tech-acc",
        filename: "tech.md",
        fullPath: "/tech.md",
        body: "Check accuracy",
        pack: "test",
        meta: { id: "tech-acc", name: "Tech Acc", type: "check" },
      };

      const evaluator = new TechnicalAccuracyEvaluator(
        mockLlmProvider,
        prompt,
        mockSearchProvider
      );

      // Mock detection phase - no issues found
      const mockUnstructured = vi.mocked(mockLlmProvider.runPromptUnstructured);
      mockUnstructured.mockResolvedValue({
        data: "No issues found.",
        usage: { inputTokens: 100, outputTokens: 50 },
      });

      // Mock claim extraction to return empty list wrapped in LLMResult
      // eslint-disable-next-line @typescript-eslint/unbound-method
      const mockFn = vi.mocked(mockLlmProvider.runPromptStructured);
      mockFn.mockResolvedValueOnce({ data: { claims: [] } });

      const result = await evaluator.evaluate("file.md", "content");

      if (result.type !== EvaluationType.CHECK)
        throw new Error("Wrong result type");
      expect(result.final_score).toBe(10);
      expect(result.items).toEqual([]);
    });
  });
});
