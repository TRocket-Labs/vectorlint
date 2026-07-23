import { describe, it, expect, vi } from "vitest";
import { BaseEvaluator } from "../src/evaluators/base-evaluator";
import type { LLMProvider, LLMResult } from "../src/providers/llm-provider";
import type { PromptFile } from "../src/schemas/prompt-schemas";
import type { EvaluationLLMResult } from "../src/prompts/schema";
import type { SearchProvider } from "../src/providers/search-provider";

const FULLY_SUPPORTED_CHECKS = {
  rule_supports_claim: true,
  evidence_exact: true,
  context_supports_violation: true,
  plausible_non_violation: false,
  fix_is_drop_in: true,
  fix_preserves_meaning: true,
};

const CHECK_NOTES = {
  rule_supports_claim: "Supported",
  evidence_exact: "Exact",
  context_supports_violation: "Supported",
  plausible_non_violation: "None",
  fix_is_drop_in: "Drop-in",
  fix_preserves_meaning: "Preserved",
};

describe("Scoring Types", () => {
  const mockLlmProvider = {
    runPromptStructured: vi.fn(),
  } as unknown as LLMProvider;

  describe("Evaluation", () => {
    const prompt: PromptFile = {
      id: "test-rule",
      filename: "test.md",
      fullPath: "/test.md",
      body: "Find violations.",
      pack: "test",
      meta: {
        id: "test-rule",
        name: "Test Rule",
      },
    };

    it("should calculate score correctly based on violation count", async () => {
      const evaluator = new BaseEvaluator(mockLlmProvider, prompt);

      // Mock LLM returning violations only wrapped in LLMResult
      const mockLlmResponse: LLMResult<EvaluationLLMResult> = {
        data: {
          reasoning: "Two issues found",
          violations: [
            {
              line: 1,
              description: "Issue 1",
              analysis: "First issue found",
              message: "First issue",
              suggestion: "",
              fix: "",
              quoted_text: "",
              context_before: "",
              context_after: "",
              rule_quote: "",
              checks: FULLY_SUPPORTED_CHECKS,
              check_notes: CHECK_NOTES,
              confidence: 0.9,
            },
            {
              line: 2,
              description: "Issue 2",
              analysis: "Second issue found",
              message: "Second issue",
              suggestion: "",
              fix: "",
              quoted_text: "",
              context_before: "",
              context_after: "",
              rule_quote: "",
              checks: FULLY_SUPPORTED_CHECKS,
              check_notes: CHECK_NOTES,
              confidence: 0.9,
            },
          ],
        },
      };

      // eslint-disable-next-line @typescript-eslint/unbound-method
      const mockFn = vi.mocked(mockLlmProvider.runPromptStructured);
      mockFn.mockResolvedValueOnce(mockLlmResponse);

      const content = new Array(100).fill("word").join(" ");
      const result = await evaluator.evaluate("file.md", content);

      expect(result.violations).toHaveLength(2);
      expect(result.word_count).toBe(100);
    });

    it("should handle empty violations list (perfect score)", async () => {
      const evaluator = new BaseEvaluator(mockLlmProvider, prompt);

      const mockLlmResponse: LLMResult<EvaluationLLMResult> = {
        data: {
          reasoning: "No issues found",
          violations: [],
        },
      };

      // eslint-disable-next-line @typescript-eslint/unbound-method
      const mockFn = vi.mocked(mockLlmProvider.runPromptStructured);
      mockFn.mockResolvedValueOnce(mockLlmResponse);

      const result = await evaluator.evaluate("file.md", "content");

      expect(result.violations).toHaveLength(0);
      expect(result.word_count).toBeGreaterThan(0);
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
        meta: { id: "tech-acc", name: "Tech Acc" },
      };

      const evaluator = new TechnicalAccuracyEvaluator(
        mockLlmProvider,
        prompt,
        mockSearchProvider
      );

      // Mock claim extraction to return empty list wrapped in LLMResult
      // eslint-disable-next-line @typescript-eslint/unbound-method
      const mockFn = vi.mocked(mockLlmProvider.runPromptStructured);
      mockFn.mockResolvedValueOnce({ data: { claims: [] } });

      const result = await evaluator.evaluate("file.md", "content");

      expect(result.violations).toHaveLength(0);
      expect(result.word_count).toBeGreaterThan(0);
    });
  });
});
