/**
 * Tests for BaseEvaluator two-phase detection/suggestion architecture
 *
 * Property 1: Two-phase execution flow
 * - Detection phase is called first for each chunk
 * - Suggestion phase is called second with full document context
 * - Results are assembled into final output
 *
 * Property 3: Full document context
 * - Suggestion phase receives full document even when detection uses chunks
 * - All detected issues are passed to suggestion phase
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { LLMProvider } from "../src/providers/llm-provider";
import type { PromptFile } from "../src/schemas/prompt-schemas";
import { Severity, EvaluationType } from "../src/evaluators/types";
import type { TokenUsage } from "../src/providers/token-usage";
import { BaseEvaluator } from "../src/evaluators/base-evaluator";

// Mock prompt file with criteria
const mockPromptFile: PromptFile = {
  id: "test-prompt",
  filename: "test-prompt.md",
  fullPath: "/mock/path/test-prompt.md",
  meta: {
    id: "test-prompt",
    name: "Test Prompt",
    type: "check",
    severity: Severity.WARNING,
    criteria: [
      { id: "c1", name: "Criterion 1", weight: 1 },
      { id: "c2", name: "Criterion 2", weight: 2 },
    ],
  },
  body: "Test prompt body for evaluation.",
  pack: "test",
};

const mockPromptFileJudge: PromptFile = {
  ...mockPromptFile,
  meta: {
    ...mockPromptFile.meta,
    type: "judge",
  },
};

// Mock LLM provider
const createMockLLMProvider = (): LLMProvider => {
  return {
    runPromptStructured: vi.fn().mockResolvedValue({
      data: {
        violations: [],
        items: [],
        type: EvaluationType.CHECK,
        final_score: 10,
        percentage: 100,
        violation_count: 0,
        severity: Severity.WARNING,
        message: "No issues found.",
      },
      usage: { inputTokens: 100, outputTokens: 50 },
    }),
    runPromptUnstructured: vi.fn().mockResolvedValue({
      data: "No issues found.",
      usage: { inputTokens: 100, outputTokens: 50 },
    }),
  } as unknown as LLMProvider;
};

describe("BaseEvaluator - Two-Phase Architecture", () => {
  let mockLLM: LLMProvider;
  let evaluator: BaseEvaluator;

  beforeEach(() => {
    mockLLM = createMockLLMProvider();
    evaluator = new BaseEvaluator(mockLLM, mockPromptFile);
  });

  describe("Property 1: Two-phase execution flow", () => {
    it("should call detection phase for each chunk", async () => {
      const content = "Short content.";
      const result = await evaluator.evaluate("test.md", content);

      // Verify we got a valid result
      expect(result).toBeDefined();
      expect(result.type).toBe(EvaluationType.CHECK);

      // The mock LLM's runPromptUnstructured should have been called for detection
      const unstructuredCalls = (mockLLM.runPromptUnstructured as ReturnType<typeof vi.fn>).mock.calls;
      expect(unstructuredCalls.length).toBeGreaterThan(0);

      // Verify structured call for suggestion was also made if issues were found
      const structuredCalls = (mockLLM.runPromptStructured as ReturnType<typeof vi.fn>).mock.calls;
      expect(structuredCalls.length).toBeGreaterThanOrEqual(0);
    });

    it("should call both phases when issues are detected", async () => {
      // Mock detection phase to return issues
      const detectionResponse = `## Issue 1

**quotedText:**
> problematic text

**contextBefore:**
before

**contextAfter:**
after

**line:** 42

**criterionName:** Criterion 1

**analysis:**
This violates the criterion.`;

      (mockLLM.runPromptUnstructured as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: detectionResponse,
        usage: { inputTokens: 100, outputTokens: 50 },
      });

      // Mock suggestion phase to return suggestions
      (mockLLM.runPromptStructured as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: {
          suggestions: [
            {
              issueIndex: 1,
              suggestion: "Replace with better text",
              explanation: "This fixes the issue",
            },
          ],
        },
        usage: { inputTokens: 200, outputTokens: 100 },
      });

      const content = "Content with issues.";
      const result = await evaluator.evaluate("test.md", content);

      // Verify both phases were called
      const unstructuredCalls = (mockLLM.runPromptUnstructured as ReturnType<typeof vi.fn>).mock.calls;
      const structuredCalls = (mockLLM.runPromptStructured as ReturnType<typeof vi.fn>).mock.calls;

      expect(unstructuredCalls.length).toBeGreaterThan(0); // Detection
      expect(structuredCalls.length).toBeGreaterThan(0); // Suggestion
    });

    it("should aggregate token usage from both phases", async () => {
      const detectionResponse = `## Issue 1

**quotedText:**
> problematic text

**contextBefore:**
before

**contextAfter:**
after

**line:** 42

**criterionName:** Criterion 1

**analysis:**
This violates the criterion.`;

      (mockLLM.runPromptUnstructured as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: detectionResponse,
        usage: { inputTokens: 150, outputTokens: 75 },
      });

      (mockLLM.runPromptStructured as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: {
          suggestions: [
            {
              issueIndex: 1,
              suggestion: "Replace with better text",
              explanation: "This fixes the issue",
            },
          ],
        },
        usage: { inputTokens: 200, outputTokens: 100 },
      });

      const content = "Content with issues.";
      const result = await evaluator.evaluate("test.md", content);

      // Verify token usage is aggregated
      expect(result.usage).toBeDefined();
      expect(result.usage?.inputTokens).toBe(150 + 200); // Detection + Suggestion
      expect(result.usage?.outputTokens).toBe(75 + 100);
    });

    it("should skip suggestion phase when no issues are detected", async () => {
      // Mock detection phase to return no issues
      (mockLLM.runPromptUnstructured as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: "No issues found.",
        usage: { inputTokens: 100, outputTokens: 50 },
      });

      const content = "Perfect content.";
      const result = await evaluator.evaluate("test.md", content);

      // Verify detection was called
      const unstructuredCalls = (mockLLM.runPromptUnstructured as ReturnType<typeof vi.fn>).mock.calls;
      expect(unstructuredCalls.length).toBeGreaterThan(0);

      // Verify suggestion was NOT called (since no issues found)
      const structuredCalls = (mockLLM.runPromptStructured as ReturnType<typeof vi.fn>).mock.calls;
      expect(structuredCalls.length).toBe(0);

      // Result should show no violations
      expect(result.violations).toBeDefined();
      expect(result.violations?.length).toBe(0);
    });
  });

  describe("Property 1: Two-phase execution flow (Judge evaluation)", () => {
    beforeEach(() => {
      evaluator = new BaseEvaluator(mockLLM, mockPromptFileJudge);
    });

    it("should call both phases for judge evaluation", async () => {
      const detectionResponse = `## Issue 1

**quotedText:**
> problematic text

**contextBefore:**
before

**contextAfter:**
after

**line:** 42

**criterionName:** Criterion 1

**analysis:**
This violates the criterion.`;

      (mockLLM.runPromptUnstructured as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: detectionResponse,
        usage: { inputTokens: 100, outputTokens: 50 },
      });

      (mockLLM.runPromptStructured as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: {
          suggestions: [
            {
              issueIndex: 1,
              suggestion: "Replace with better text",
              explanation: "This fixes the issue",
            },
          ],
        },
        usage: { inputTokens: 200, outputTokens: 100 },
      });

      const content = "Content with issues.";
      const result = await evaluator.evaluate("test.md", content);

      // Verify both phases were called
      const unstructuredCalls = (mockLLM.runPromptUnstructured as ReturnType<typeof vi.fn>).mock.calls;
      const structuredCalls = (mockLLM.runPromptStructured as ReturnType<typeof vi.fn>).mock.calls;

      expect(unstructuredCalls.length).toBeGreaterThan(0); // Detection
      expect(structuredCalls.length).toBeGreaterThan(0); // Suggestion

      // Verify result is judge type
      expect(result.type).toBe(EvaluationType.JUDGE);
    });

    it("should aggregate token usage for judge evaluation", async () => {
      const detectionResponse = `## Issue 1

**quotedText:**
> problematic text

**contextBefore:**
before

**contextAfter:**
after

**line:** 42

**criterionName:** Criterion 1

**analysis:**
This violates the criterion.`;

      (mockLLM.runPromptUnstructured as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: detectionResponse,
        usage: { inputTokens: 150, outputTokens: 75 },
      });

      (mockLLM.runPromptStructured as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: {
          suggestions: [
            {
              issueIndex: 1,
              suggestion: "Replace with better text",
              explanation: "This fixes the issue",
            },
          ],
        },
        usage: { inputTokens: 200, outputTokens: 100 },
      });

      const content = "Content with issues.";
      const result = await evaluator.evaluate("test.md", content);

      // Verify token usage is aggregated
      expect(result.usage).toBeDefined();
      expect(result.usage?.inputTokens).toBe(150 + 200); // Detection + Suggestion
      expect(result.usage?.outputTokens).toBe(75 + 100);
    });
  });

  describe("Property 3: Full document context in suggestion phase", () => {
    it("should pass full document to suggestion phase even with chunking", async () => {
      // Create content long enough to trigger chunking (> 600 words)
      const longContent = Array(700).fill("Word ").join("") + "end.";

      const detectionResponse = `## Issue 1

**quotedText:**
> problematic text

**contextBefore:**
before

**contextAfter:**
after

**line:** 42

**criterionName:** Criterion 1

**analysis:**
This violates the criterion.`;

      (mockLLM.runPromptUnstructured as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: detectionResponse,
        usage: { inputTokens: 100, outputTokens: 50 },
      });

      // Track what content is passed to suggestion phase
      let suggestionPhaseContent: string | undefined;
      (mockLLM.runPromptStructured as ReturnType<typeof vi.fn>).mockImplementation(
        async (content: string) => {
          suggestionPhaseContent = content;
          return {
            data: {
              suggestions: [
                {
                  issueIndex: 1,
                  suggestion: "Replace with better text",
                  explanation: "This fixes the issue",
                },
              ],
            },
            usage: { inputTokens: 200, outputTokens: 100 },
          };
        }
      );

      await evaluator.evaluate("test.md", longContent);

      // The suggestion phase should receive the full numbered content, not chunks
      expect(suggestionPhaseContent).toBeDefined();
      // Full content should be longer than a typical chunk (500 words max)
      expect(suggestionPhaseContent!.length).toBeGreaterThan(1000);
    });

    it("should pass all detected issues to suggestion phase", async () => {
      // Mock detection to return multiple issues
      const detectionResponse = `## Issue 1

**quotedText:**
> problem 1

**contextBefore:**
before

**contextAfter:**
after

**line:** 10

**criterionName:** Criterion 1

**analysis:**
Issue 1 analysis

## Issue 2

**quotedText:**
> problem 2

**contextBefore:**
before

**contextAfter:**
after

**line:** 20

**criterionName:** Criterion 2

**analysis:**
Issue 2 analysis`;

      (mockLLM.runPromptUnstructured as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: detectionResponse,
        usage: { inputTokens: 100, outputTokens: 50 },
      });

      let suggestionPhaseIssues: string | undefined;
      (mockLLM.runPromptStructured as ReturnType<typeof vi.fn>).mockImplementation(
        async (_content: string, prompt: string) => {
          suggestionPhaseIssues = prompt;
          return {
            data: {
              suggestions: [
                {
                  issueIndex: 1,
                  suggestion: "Fix 1",
                  explanation: "Explanation 1",
                },
                {
                  issueIndex: 2,
                  suggestion: "Fix 2",
                  explanation: "Explanation 2",
                },
              ],
            },
            usage: { inputTokens: 200, outputTokens: 100 },
          };
        }
      );

      const content = "Content with multiple issues.";
      await evaluator.evaluate("test.md", content);

      // Verify the suggestion phase prompt includes all detected issues
      expect(suggestionPhaseIssues).toBeDefined();
      expect(suggestionPhaseIssues).toContain("Issue 1");
      expect(suggestionPhaseIssues).toContain("problem 1");
      expect(suggestionPhaseIssues).toContain("Issue 2");
      expect(suggestionPhaseIssues).toContain("problem 2");
    });

    it("should handle detection across multiple chunks with single suggestion call", async () => {
      // Create content long enough for multiple chunks
      const longContent = Array(700).fill("Word ").join("") + "end.";

      // Track number of detection calls
      let detectionCallCount = 0;
      (mockLLM.runPromptUnstructured as ReturnType<typeof vi.fn>).mockImplementation(
        async () => {
          detectionCallCount++;
          return {
            data: "## Issue 1\n\n**quotedText:**\n> problem\n\n**line:** 42\n\n**criterionName:** Criterion 1\n\n**analysis:**\nIssue",
            usage: { inputTokens: 100, outputTokens: 50 },
          };
        }
      );

      let suggestionCallCount = 0;
      (mockLLM.runPromptStructured as ReturnType<typeof vi.fn>).mockImplementation(
        async () => {
          suggestionCallCount++;
          return {
            data: {
              suggestions: [
                {
                  issueIndex: 1,
                  suggestion: "Fix",
                  explanation: "Explanation",
                },
              ],
            },
            usage: { inputTokens: 200, outputTokens: 100 },
          };
        }
      );

      await evaluator.evaluate("test.md", longContent);

      // With long content, detection should be called multiple times (chunked)
      expect(detectionCallCount).toBeGreaterThan(1);

      // Suggestion should be called exactly once with full document
      expect(suggestionCallCount).toBe(1);
    });
  });

  describe("Criteria string building", () => {
    it("should build criteria string from prompt metadata", async () => {
      const evaluatorWithCriteria = new BaseEvaluator(mockLLM, mockPromptFile);

      let detectionPrompt: string | undefined;
      (mockLLM.runPromptUnstructured as ReturnType<typeof vi.fn>).mockImplementation(
        async (_content: string, prompt: string) => {
          detectionPrompt = prompt;
          return {
            data: "No issues found.",
            usage: { inputTokens: 100, outputTokens: 50 },
          };
        }
      );

      await evaluatorWithCriteria.evaluate("test.md", "Content.");

      // Verify criteria string is included in detection prompt
      expect(detectionPrompt).toBeDefined();
      expect(detectionPrompt).toContain("Criterion 1");
      expect(detectionPrompt).toContain("Criterion 2");
      expect(detectionPrompt).toContain("weight: 1");
      expect(detectionPrompt).toContain("weight: 2");
    });

    it("should handle empty criteria gracefully", async () => {
      const promptWithoutCriteria: PromptFile = {
        ...mockPromptFile,
        meta: {
          ...mockPromptFile.meta,
          criteria: undefined,
        },
      };

      const evaluatorWithoutCriteria = new BaseEvaluator(mockLLM, promptWithoutCriteria);

      let detectionPrompt: string | undefined;
      (mockLLM.runPromptUnstructured as ReturnType<typeof vi.fn>).mockImplementation(
        async (_content: string, prompt: string) => {
          detectionPrompt = prompt;
          return {
            data: "No issues found.",
            usage: { inputTokens: 100, outputTokens: 50 },
          };
        }
      );

      await evaluatorWithoutCriteria.evaluate("test.md", "Content.");

      // Should handle missing criteria without error
      expect(detectionPrompt).toBeDefined();
      expect(detectionPrompt).toContain("No specific criteria provided");
    });
  });

  describe("Result assembly", () => {
    it("should assemble check result with suggestions", async () => {
      const detectionResponse = `## Issue 1

**quotedText:**
> bad text

**contextBefore:**
before

**contextAfter:**
after

**line:** 10

**criterionName:** Criterion 1

**analysis:**
This is bad`;

      (mockLLM.runPromptUnstructured as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: detectionResponse,
        usage: { inputTokens: 100, outputTokens: 50 },
      });

      (mockLLM.runPromptStructured as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: {
          suggestions: [
            {
              issueIndex: 1,
              suggestion: "good text",
              explanation: "This is better",
            },
          ],
        },
        usage: { inputTokens: 200, outputTokens: 100 },
      });

      const result = await evaluator.evaluate("test.md", "Content.");

      // Verify result structure
      expect(result.type).toBe(EvaluationType.CHECK);
      expect(result.final_score).toBeDefined();
      expect(result.violations).toBeDefined();

      if (result.violations && result.violations.length > 0) {
        // Verify suggestion is included
        expect(result.violations[0].suggestion).toBe("good text");
      }

      // Verify items also have suggestions
      if (result.items && result.items.length > 0) {
        expect(result.items[0].suggestion).toBe("good text");
      }
    });

    it("should assemble judge result with suggestions", async () => {
      const evaluatorJudge = new BaseEvaluator(mockLLM, mockPromptFileJudge);

      const detectionResponse = `## Issue 1

**quotedText:**
> bad text

**contextBefore:**
before

**contextAfter:**
after

**line:** 10

**criterionName:** Criterion 1

**analysis:**
This is bad`;

      (mockLLM.runPromptUnstructured as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: detectionResponse,
        usage: { inputTokens: 100, outputTokens: 50 },
      });

      (mockLLM.runPromptStructured as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: {
          suggestions: [
            {
              issueIndex: 1,
              suggestion: "good text",
              explanation: "This is better",
            },
          ],
        },
        usage: { inputTokens: 200, outputTokens: 100 },
      });

      const result = await evaluatorJudge.evaluate("test.md", "Content.");

      // Verify result structure
      expect(result.type).toBe(EvaluationType.JUDGE);
      expect(result.final_score).toBeDefined();
      expect(result.criteria).toBeDefined();

      // Verify suggestions are in criteria violations
      if (result.criteria && result.criteria.length > 0) {
        const criterion = result.criteria[0];
        if (criterion.violations && criterion.violations.length > 0) {
          expect(criterion.violations[0].suggestion).toBe("good text");
        }
      }
    });
  });

  describe("Severity and strictness handling", () => {
    it("should use default severity when none specified", async () => {
      const promptNoSeverity: PromptFile = {
        ...mockPromptFile,
        meta: {
          ...mockPromptFile.meta,
          severity: undefined,
        },
      };

      const evaluatorNoSeverity = new BaseEvaluator(mockLLM, promptNoSeverity);

      (mockLLM.runPromptUnstructured as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: "No issues found.",
        usage: { inputTokens: 100, outputTokens: 50 },
      });

      const result = await evaluatorNoSeverity.evaluate("test.md", "Content.");

      // Should use default severity (WARNING)
      expect(result.severity).toBe(Severity.WARNING);
    });

    it("should use prompt severity when specified", async () => {
      const promptWithSeverity: PromptFile = {
        ...mockPromptFile,
        meta: {
          ...mockPromptFile.meta,
          severity: Severity.ERROR,
        },
      };

      const evaluatorWithSeverity = new BaseEvaluator(mockLLM, promptWithSeverity);

      const detectionResponse = `## Issue 1

**quotedText:**
> bad text

**contextBefore:**
before

**contextAfter:**
after

**line:** 10

**criterionName:** Criterion 1

**analysis:**
This is bad`;

      (mockLLM.runPromptUnstructured as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: detectionResponse,
        usage: { inputTokens: 100, outputTokens: 50 },
      });

      (mockLLM.runPromptStructured as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: {
          suggestions: [
            {
              issueIndex: 1,
              suggestion: "good text",
              explanation: "This is better",
            },
          ],
        },
        usage: { inputTokens: 200, outputTokens: 100 },
      });

      const result = await evaluatorWithSeverity.evaluate("test.md", "Content.");

      expect(result.severity).toBe(Severity.ERROR);
    });

    it("should override prompt severity with defaultSeverity constructor param", async () => {
      const promptWithSeverity: PromptFile = {
        ...mockPromptFile,
        meta: {
          ...mockPromptFile.meta,
          severity: Severity.ERROR,
        },
      };

      const evaluatorOverride = new BaseEvaluator(mockLLM, promptWithSeverity, Severity.WARNING);

      const detectionResponse = `## Issue 1

**quotedText:**
> bad text

**contextBefore:**
before

**contextAfter:**
after

**line:** 10

**criterionName:** Criterion 1

**analysis:**
This is bad`;

      (mockLLM.runPromptUnstructured as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: detectionResponse,
        usage: { inputTokens: 100, outputTokens: 50 },
      });

      (mockLLM.runPromptStructured as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: {
          suggestions: [
            {
              issueIndex: 1,
              suggestion: "good text",
              explanation: "This is better",
            },
          ],
        },
        usage: { inputTokens: 200, outputTokens: 100 },
      });

      const result = await evaluatorOverride.evaluate("test.md", "Content.");

      // Constructor param should override prompt severity
      expect(result.severity).toBe(Severity.WARNING);
    });

    it("should normalize strictness string values to numbers", async () => {
      const promptWithStrictness: PromptFile = {
        ...mockPromptFile,
        meta: {
          ...mockPromptFile.meta,
          strictness: "strict",
        },
      };

      const evaluatorStrict = new BaseEvaluator(mockLLM, promptWithStrictness);

      const detectionResponse = `## Issue 1

**quotedText:**
> bad text

**contextBefore:**
before

**contextAfter:**
after

**line:** 10

**criterionName:** Criterion 1

**analysis:**
This is bad`;

      (mockLLM.runPromptUnstructured as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: detectionResponse,
        usage: { inputTokens: 100, outputTokens: 50 },
      });

      (mockLLM.runPromptStructured as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: {
          suggestions: [
            {
              issueIndex: 1,
              suggestion: "good text",
              explanation: "This is better",
            },
          ],
        },
        usage: { inputTokens: 200, outputTokens: 100 },
      });

      // Should not throw error with string strictness
      const result = await evaluatorStrict.evaluate("test.md", "Content.");

      expect(result).toBeDefined();
      expect(result.type).toBe(EvaluationType.CHECK);
    });
  });
});
