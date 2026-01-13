/**
 * Tests for ResultAssembler
 *
 * Property 6: Result schema conformance
 * - assembleCheckResult produces valid CheckResult schema
 * - assembleJudgeResult produces valid JudgeResult schema
 * - All required fields are present and correctly typed
 * - Optional fields are handled correctly
 *
 * Property 7: Token usage aggregation
 * - aggregateTokenUsage correctly combines detection and suggestion usage
 * - Returns undefined when both inputs are undefined
 * - Returns only detection usage when suggestion is undefined
 * - Returns only suggestion usage when detection is undefined
 * - Correctly sums input and output tokens
 */

import { describe, it, expect } from "vitest";
import { ResultAssembler } from "../src/evaluators/result-assembler";
import { EvaluationType, Severity } from "../src/evaluators/types";
import type { RawDetectionIssue } from "../src/evaluators/detection-phase";
import type { Suggestion } from "../src/evaluators/suggestion-phase";

describe("ResultAssembler", () => {
  describe("assembleCheckResult", () => {
    // Create test detection issues
    const createDetectionIssues = (): RawDetectionIssue[] => [
      {
        quotedText: "very bad thing",
        contextBefore: "This is a",
        contextAfter: "that happened.",
        line: 42,
        criterionName: "clarity",
        analysis: "The phrase is vague and unclear.",
      },
      {
        quotedText: "another issue",
        contextBefore: "Here is",
        contextAfter: "in the text.",
        line: 17,
        criterionName: "tone",
        analysis: "The tone is inconsistent.",
      },
    ];

    // Create test suggestions
    const createSuggestions = (): Suggestion[] => [
      {
        issueIndex: 1,
        suggestion: "specific and clear description",
        explanation: "Replace with more precise language.",
      },
      {
        issueIndex: 2,
        suggestion: "consistent text alternative",
        explanation: "Maintain consistent tone throughout.",
      },
    ];

    describe("Property 6: Result schema conformance", () => {
      it("produces valid CheckResult with all required fields", () => {
        const assembler = new ResultAssembler();
        const issues = createDetectionIssues();
        const suggestions = createSuggestions();

        const result = assembler.assembleCheckResult(issues, suggestions, {
          severity: Severity.ERROR,
          totalWordCount: 100,
        });

        // Verify type field
        expect(result.type).toBe(EvaluationType.CHECK);

        // Verify numeric fields are numbers
        expect(typeof result.final_score).toBe("number");
        expect(typeof result.percentage).toBe("number");
        expect(typeof result.violation_count).toBe("number");

        // Verify final_score is on 1-10 scale
        expect(result.final_score).toBeGreaterThanOrEqual(1);
        expect(result.final_score).toBeLessThanOrEqual(10);

        // Verify percentage is on 1-100 scale
        expect(result.percentage).toBeGreaterThanOrEqual(10);
        expect(result.percentage).toBeLessThanOrEqual(100);

        // Verify severity
        expect(result.severity).toBe(Severity.ERROR);

        // Verify message is a string
        expect(typeof result.message).toBe("string");
        expect(result.message.length).toBeGreaterThan(0);
      });

      it("produces items array matching CheckItem schema", () => {
        const assembler = new ResultAssembler();
        const issues = createDetectionIssues();
        const suggestions = createSuggestions();

        const result = assembler.assembleCheckResult(issues, suggestions);

        // Verify items is an array
        expect(Array.isArray(result.items)).toBe(true);
        expect(result.items.length).toBe(2);

        // Verify each item has required CheckItem fields
        for (const item of result.items) {
          expect(typeof item.description).toBe("string");
          expect(typeof item.analysis).toBe("string");
          expect(typeof item.quoted_text).toBe("string");
          expect(typeof item.context_before).toBe("string");
          expect(typeof item.context_after).toBe("string");
        }

        // Verify content matches detection issues
        expect(result.items[0].description).toBe("clarity");
        expect(result.items[0].quoted_text).toBe("very bad thing");
        expect(result.items[1].description).toBe("tone");
        expect(result.items[1].quoted_text).toBe("another issue");
      });

      it("produces violations array with correct structure", () => {
        const assembler = new ResultAssembler();
        const issues = createDetectionIssues();
        const suggestions = createSuggestions();

        const result = assembler.assembleCheckResult(issues, suggestions);

        // Verify violations is an array
        expect(Array.isArray(result.violations)).toBe(true);
        expect(result.violations.length).toBe(2);

        // Verify each violation has expected fields
        for (const violation of result.violations) {
          expect(typeof violation.analysis).toBe("string");
          expect(typeof violation.quoted_text).toBe("string");
          expect(typeof violation.context_before).toBe("string");
          expect(typeof violation.context_after).toBe("string");
          expect(typeof violation.criterionName).toBe("string");
        }

        // Verify suggestions are included when present
        expect(result.violations[0].suggestion).toBe("specific and clear description");
        expect(result.violations[1].suggestion).toBe("consistent text alternative");
      });

      it("handles missing suggestions correctly", () => {
        const assembler = new ResultAssembler();
        const issues = createDetectionIssues();
        const suggestions: Suggestion[] = []; // No suggestions

        const result = assembler.assembleCheckResult(issues, suggestions);

        // Items should still be created
        expect(result.items.length).toBe(2);
        expect(result.violations.length).toBe(2);

        // Suggestions should be undefined/omitted
        expect(result.items[0].suggestion).toBeUndefined();
        expect(result.violations[0].suggestion).toBeUndefined();
      });

      it("handles empty detection issues", () => {
        const assembler = new ResultAssembler();
        const issues: RawDetectionIssue[] = [];
        const suggestions: Suggestion[] = [];

        const result = assembler.assembleCheckResult(issues, suggestions, {
          totalWordCount: 100,
        });

        // Should produce perfect score when no issues
        expect(result.final_score).toBe(10);
        expect(result.violation_count).toBe(0);
        expect(result.items).toEqual([]);
        expect(result.violations).toEqual([]);
        expect(result.message).toBe("No issues found.");
      });

      it("handles partial suggestion matching", () => {
        const assembler = new ResultAssembler();
        const issues = createDetectionIssues();
        const suggestions: Suggestion[] = [
          {
            issueIndex: 1,
            suggestion: "fix for issue 1",
            explanation: "Explanation",
          },
          // No suggestion for issue 2
        ];

        const result = assembler.assembleCheckResult(issues, suggestions);

        expect(result.items.length).toBe(2);
        expect(result.items[0].suggestion).toBe("fix for issue 1");
        expect(result.items[1].suggestion).toBeUndefined();
      });
    });

    describe("check score calculation", () => {
      it("calculates score based on violation density", () => {
        const assembler = new ResultAssembler();
        const issues = createDetectionIssues();
        const suggestions = createSuggestions();

        // High violation density
        const result1 = assembler.assembleCheckResult(issues, suggestions, {
          totalWordCount: 10, // 2 violations in 10 words = high density
        });

        // Low violation density
        const result2 = assembler.assembleCheckResult(issues, suggestions, {
          totalWordCount: 1000, // 2 violations in 1000 words = low density
        });

        expect(result1.final_score).toBeLessThan(result2.final_score);
      });

      it("returns score of 10 when no violations", () => {
        const assembler = new ResultAssembler();
        const result = assembler.assembleCheckResult([], [], {
          totalWordCount: 100,
        });

        expect(result.final_score).toBe(10);
      });
    });
  });

  describe("assembleJudgeResult", () => {
    const createDetectionIssues = (): RawDetectionIssue[] => [
      {
        quotedText: "vague statement",
        contextBefore: "This is a",
        contextAfter: "in the text.",
        line: 10,
        criterionName: "clarity",
        analysis: "Lacks specificity.",
      },
      {
        quotedText: "another vague statement",
        contextBefore: "Here is",
        contextAfter: "as well.",
        line: 25,
        criterionName: "clarity",
        analysis: "Also unclear.",
      },
      {
        quotedText: "inappropriate tone",
        contextBefore: "The",
        contextAfter: "is wrong.",
        line: 33,
        criterionName: "tone",
        analysis: "Too informal.",
      },
    ];

    const createSuggestions = (): Suggestion[] => [
      {
        issueIndex: 1,
        suggestion: "specific statement",
        explanation: "Fix 1",
      },
      {
        issueIndex: 2,
        suggestion: "clear statement",
        explanation: "Fix 2",
      },
      {
        issueIndex: 3,
        suggestion: "appropriate tone",
        explanation: "Fix 3",
      },
    ];

    describe("Property 6: Result schema conformance", () => {
      it("produces valid JudgeResult with all required fields", () => {
        const assembler = new ResultAssembler();
        const issues = createDetectionIssues();
        const suggestions = createSuggestions();

        const result = assembler.assembleJudgeResult(issues, suggestions, {
          promptCriteria: [
            { name: "clarity", weight: 2 },
            { name: "tone", weight: 1 },
          ],
        });

        // Verify type field
        expect(result.type).toBe(EvaluationType.JUDGE);

        // Verify final_score is on 1-10 scale
        expect(typeof result.final_score).toBe("number");
        expect(result.final_score).toBeGreaterThanOrEqual(1);
        expect(result.final_score).toBeLessThanOrEqual(10);

        // Verify criteria is an array
        expect(Array.isArray(result.criteria)).toBe(true);
        expect(result.criteria.length).toBeGreaterThan(0);
      });

      it("produces criteria array matching JudgeResult schema", () => {
        const assembler = new ResultAssembler();
        const issues = createDetectionIssues();
        const suggestions = createSuggestions();

        const result = assembler.assembleJudgeResult(issues, suggestions, {
          promptCriteria: [
            { name: "clarity", weight: 2 },
            { name: "tone", weight: 1 },
          ],
        });

        // Verify each criterion has required fields
        for (const criterion of result.criteria) {
          expect(typeof criterion.name).toBe("string");
          expect(typeof criterion.weight).toBe("number");
          expect(typeof criterion.score).toBe("number");
          expect([1, 2, 3, 4]).toContain(criterion.score);
          expect(typeof criterion.normalized_score).toBe("number");
          expect(typeof criterion.weighted_points).toBe("number");
          expect(typeof criterion.summary).toBe("string");
          expect(typeof criterion.reasoning).toBe("string");
          expect(Array.isArray(criterion.violations)).toBe(true);
        }

        // Verify criteria names match
        const criterionNames = result.criteria.map((c) => c.name);
        expect(criterionNames).toContain("clarity");
        expect(criterionNames).toContain("tone");
      });

      it("groups violations by criterion name", () => {
        const assembler = new ResultAssembler();
        const issues = createDetectionIssues();
        const suggestions = createSuggestions();

        const result = assembler.assembleJudgeResult(issues, suggestions);

        // Clarity should have 2 violations
        const clarityCriteria = result.criteria.find((c) => c.name === "clarity");
        expect(clarityCriteria).toBeDefined();
        expect(clarityCriteria!.violations.length).toBe(2);

        // Tone should have 1 violation
        const toneCriteria = result.criteria.find((c) => c.name === "tone");
        expect(toneCriteria).toBeDefined();
        expect(toneCriteria!.violations.length).toBe(1);
      });

      it("calculates scores based on violation count", () => {
        const assembler = new ResultAssembler();
        const issues = createDetectionIssues();
        const suggestions = createSuggestions();

        const result = assembler.assembleJudgeResult(issues, suggestions);

        const clarityCriteria = result.criteria.find((c) => c.name === "clarity");
        const toneCriteria = result.criteria.find((c) => c.name === "tone");

        // Clarity has 2 violations -> score should be 2
        expect(clarityCriteria!.score).toBe(2);

        // Tone has 1 violation -> score should be 3
        expect(toneCriteria!.score).toBe(3);
      });

      it("handles empty detection issues", () => {
        const assembler = new ResultAssembler();
        const result = assembler.assembleJudgeResult([], [], {
          promptCriteria: [{ name: "clarity", weight: 1 }],
        });

        expect(result.criteria).toEqual([]);
        expect(result.final_score).toBe(10);
      });

      it("provides default suggestions when missing", () => {
        const assembler = new ResultAssembler();
        const issues = createDetectionIssues();
        const suggestions: Suggestion[] = []; // No suggestions

        const result = assembler.assembleJudgeResult(issues, suggestions);

        // All violations should have fallback suggestion text
        for (const criterion of result.criteria) {
          for (const violation of criterion.violations) {
            expect(typeof violation.suggestion).toBe("string");
            expect(violation.suggestion).toBe("No specific suggestion provided.");
          }
        }
      });
    });
  });

  describe("Property 7: Token usage aggregation", () => {
    it("returns undefined when both inputs are undefined", () => {
      const assembler = new ResultAssembler();
      const result = assembler.aggregateTokenUsage(undefined, undefined);

      expect(result).toBeUndefined();
    });

    it("returns detection usage when suggestion is undefined", () => {
      const assembler = new ResultAssembler();
      const detectionUsage = { inputTokens: 100, outputTokens: 50 };

      const result = assembler.aggregateTokenUsage(detectionUsage, undefined);

      expect(result).toEqual({ inputTokens: 100, outputTokens: 50 });
    });

    it("returns suggestion usage when detection is undefined", () => {
      const assembler = new ResultAssembler();
      const suggestionUsage = { inputTokens: 200, outputTokens: 75 };

      const result = assembler.aggregateTokenUsage(undefined, suggestionUsage);

      expect(result).toEqual({ inputTokens: 200, outputTokens: 75 });
    });

    it("correctly sums both usage objects", () => {
      const assembler = new ResultAssembler();
      const detectionUsage = { inputTokens: 100, outputTokens: 50 };
      const suggestionUsage = { inputTokens: 200, outputTokens: 75 };

      const result = assembler.aggregateTokenUsage(detectionUsage, suggestionUsage);

      expect(result).toEqual({
        inputTokens: 300,
        outputTokens: 125,
      });
    });

    it("handles zero values correctly", () => {
      const assembler = new ResultAssembler();
      const detectionUsage = { inputTokens: 0, outputTokens: 0 };
      const suggestionUsage = { inputTokens: 100, outputTokens: 25 };

      const result = assembler.aggregateTokenUsage(detectionUsage, suggestionUsage);

      expect(result).toEqual({
        inputTokens: 100,
        outputTokens: 25,
      });
    });

    it("correctly aggregates large token counts", () => {
      const assembler = new ResultAssembler();
      const detectionUsage = { inputTokens: 1500, outputTokens: 800 };
      const suggestionUsage = { inputTokens: 2000, outputTokens: 1200 };

      const result = assembler.aggregateTokenUsage(detectionUsage, suggestionUsage);

      expect(result).toEqual({
        inputTokens: 3500,
        outputTokens: 2000,
      });
    });
  });

  describe("integration scenarios", () => {
    it("assembles complete check result with all phases", () => {
      const assembler = new ResultAssembler();

      const detectionIssues: RawDetectionIssue[] = [
        {
          quotedText: "problematic text",
          contextBefore: "Before",
          contextAfter: "After",
          line: 5,
          criterionName: "grammar",
          analysis: "Grammatical error found.",
        },
      ];

      const suggestions: Suggestion[] = [
        {
          issueIndex: 1,
          suggestion: "corrected text",
          explanation: "Fix the grammar.",
        },
      ];

      const detectionUsage = { inputTokens: 500, outputTokens: 100 };
      const suggestionUsage = { inputTokens: 600, outputTokens: 150 };

      const result = assembler.assembleCheckResult(detectionIssues, suggestions, {
        severity: Severity.ERROR,
        totalWordCount: 100,
      });

      const aggregatedUsage = assembler.aggregateTokenUsage(
        detectionUsage,
        suggestionUsage
      );

      // Verify result structure
      expect(result.type).toBe(EvaluationType.CHECK);
      expect(result.violation_count).toBe(1);
      expect(result.items[0].suggestion).toBe("corrected text");

      // Verify token aggregation
      expect(aggregatedUsage).toEqual({
        inputTokens: 1100,
        outputTokens: 250,
      });
    });

    it("assembles complete judge result with all phases", () => {
      const assembler = new ResultAssembler();

      const detectionIssues: RawDetectionIssue[] = [
        {
          quotedText: "issue 1",
          contextBefore: "",
          contextAfter: "",
          line: 1,
          criterionName: "style",
          analysis: "Style issue.",
        },
        {
          quotedText: "issue 2",
          contextBefore: "",
          contextAfter: "",
          line: 2,
          criterionName: "style",
          analysis: "Another style issue.",
        },
      ];

      const suggestions: Suggestion[] = [
        {
          issueIndex: 1,
          suggestion: "fix 1",
          explanation: "Explanation 1",
        },
        {
          issueIndex: 2,
          suggestion: "fix 2",
          explanation: "Explanation 2",
        },
      ];

      const result = assembler.assembleJudgeResult(detectionIssues, suggestions, {
        promptCriteria: [{ name: "style", weight: 1 }],
      });

      // Verify result structure
      expect(result.type).toBe(EvaluationType.JUDGE);
      expect(result.criteria.length).toBe(1);
      expect(result.criteria[0].violations.length).toBe(2);
      expect(result.criteria[0].score).toBe(2); // 2 violations -> score 2
    });
  });
});
