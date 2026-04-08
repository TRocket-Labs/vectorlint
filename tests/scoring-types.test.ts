import { describe, it, expect, vi } from "vitest";
import { runLint } from "../src/lint";
import { ReviewType } from "../src/lint/types";
import type { LLMProvider, LLMResult } from "../src/providers/llm-provider";
import type { RuleFile } from "../src/schemas/rule-schemas";
import type {
  JudgeLLMResult,
  CheckLLMResult,
} from "../src/prompts/schema";

describe("Scoring Types", () => {
  const mockLlmProvider = {
    runPromptStructured: vi.fn(),
  } as unknown as LLMProvider;

  describe("Judge Evaluation", () => {
    const judgePrompt: RuleFile = {
      id: "test-judge",
      filename: "test.md",
      fullPath: "/test.md",
      content: "Evaluate this.",
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
      // Mock LLM returning raw scores (0-4) wrapped in LLMResult
      const mockLlmResponse: LLMResult<JudgeLLMResult> = {
        data: {
          criteria: [
            {
              name: "Criterion 1",
              score: 4, // 100%
              summary: "Good",
              reasoning: "Reason",
              violations: [],
            },
            {
              name: "Criterion 2",
              score: 2, // 50%
              summary: "Okay",
              reasoning: "Reason",
              violations: [],
            },
          ],
        },
      };

      // eslint-disable-next-line @typescript-eslint/unbound-method
      const mockFn = vi.mocked(mockLlmProvider.runPromptStructured);
      mockFn.mockResolvedValueOnce(mockLlmResponse);

      const result = await runLint({ content: "content", rule: judgePrompt, provider: mockLlmProvider });

      if (result.type !== ReviewType.JUDGE)
        throw new Error("Wrong result type");

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

  describe("Check Evaluation", () => {
    const checkPrompt: RuleFile = {
      id: "test-check",
      filename: "test.md",
      fullPath: "/test.md",
      content: "Count things.",
      pack: "test",
      meta: {
        id: "test-check",
        name: "Test Check",
        type: "check",
      },
    };

    it("should calculate score correctly based on violation count", async () => {
      // Mock LLM returning violations only wrapped in LLMResult
      const mockLlmResponse: LLMResult<CheckLLMResult> = {
        data: {
          violations: [
            {
              description: "Issue 1",
              analysis: "First issue found",
              suggestion: "",
              quoted_text: "",
              context_before: "",
              context_after: "",
            },
            {
              description: "Issue 2",
              analysis: "Second issue found",
              suggestion: "",
              quoted_text: "",
              context_before: "",
              context_after: "",
            },
          ],
        },
      };

      // eslint-disable-next-line @typescript-eslint/unbound-method
      const mockFn = vi.mocked(mockLlmProvider.runPromptStructured);
      mockFn.mockResolvedValueOnce(mockLlmResponse);

      const content = new Array(100).fill("word").join(" ");
      const result = await runLint({ content, rule: checkPrompt, provider: mockLlmProvider });

      if (result.type !== ReviewType.CHECK)
        throw new Error("Wrong result type");

      // Evaluator now returns raw violations and word count — scoring deferred to orchestrator
      expect(result.violations).toHaveLength(2);
      expect(result.word_count).toBe(100);
    });

    it("should handle empty violations list (perfect score)", async () => {
      const mockLlmResponse: LLMResult<CheckLLMResult> = {
        data: {
          violations: [],
        },
      };

      // eslint-disable-next-line @typescript-eslint/unbound-method
      const mockFn = vi.mocked(mockLlmProvider.runPromptStructured);
      mockFn.mockResolvedValueOnce(mockLlmResponse);

      const result = await runLint({ content: "content", rule: checkPrompt, provider: mockLlmProvider });

      if (result.type !== ReviewType.CHECK)
        throw new Error("Wrong result type");

      expect(result.violations).toHaveLength(0);
      expect(result.word_count).toBeGreaterThan(0);
    });
  });
});
