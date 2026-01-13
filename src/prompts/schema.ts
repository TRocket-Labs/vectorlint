import { EvaluationType, Severity } from "../evaluators/types";
import type { TokenUsage } from "../providers/token-usage";

export function buildJudgeLLMSchema() {
  return {
    name: "vectorlint_judge_result",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        criteria: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              reasoning: {
                type: "string",
                description:
                  "Thorough step-by-step logic for the evaluation of this specific criterion.",
              },
              name: { type: "string" },
              summary: { type: "string" },
              score: { type: "number", enum: [1, 2, 3, 4] },
              violations: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    line: { type: "number" },
                    quoted_text: { type: "string" },
                    context_before: { type: "string" },
                    context_after: { type: "string" },
                    analysis: { type: "string" },
                    suggestion: { type: "string" },
                  },
                  required: [
                    "quoted_text",
                    "context_before",
                    "context_after",
                    "analysis",
                    "suggestion",
                  ],
                },
              },
            },
            required: ["reasoning", "name", "score", "summary", "violations"],
          },
        },
      },
      required: ["criteria"],
    },
  } as const;
}

export function buildCheckLLMSchema() {
  return {
    name: "vectorlint_check_result",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        violations: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              line: { type: "number" },
              quoted_text: { type: "string" },
              context_before: { type: "string" },
              context_after: { type: "string" },
              description: { type: "string" },
              analysis: { type: "string" },
              suggestion: { type: "string" },
            },
            required: [
              "quoted_text",
              "context_before",
              "context_after",
              "description",
              "analysis",
              "suggestion",
            ],
          },
        },
      },
      required: ["violations"],
    },
  } as const;
}

export function buildSuggestionLLMSchema() {
  return {
    name: "vectorlint_suggestion_result",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        suggestions: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              issueIndex: {
                type: "number",
                description: "The index of the issue this suggestion addresses (1-based, matching Issue 1, Issue 2, etc.)",
              },
              suggestion: {
                type: "string",
                description: "Specific, actionable text to replace the problematic content",
              },
              explanation: {
                type: "string",
                description: "Brief explanation of how this suggestion addresses the issue",
              },
            },
            required: ["issueIndex", "suggestion", "explanation"],
          },
        },
      },
      required: ["suggestions"],
    },
  } as const;
}

export type JudgeLLMResult = {
  criteria: Array<{
    name: string;
    score: 1 | 2 | 3 | 4;
    summary: string;
    reasoning: string;
    violations: Array<{
      quoted_text: string;
      context_before: string;
      context_after: string;
      analysis: string;
      suggestion: string;
    }>;
  }>;
};

export type CheckLLMResult = {
  violations: Array<{
    description: string;
    analysis: string;
    suggestion?: string;
    quoted_text?: string;
    context_before?: string;
    context_after?: string;
  }>;
};

export type SuggestionLLMResult = {
  suggestions: Array<{
    issueIndex: number;
    suggestion: string;
    explanation: string;
  }>;
};

export type JudgeResult = {
  type: typeof EvaluationType.JUDGE;
  final_score: number; // 1-10
  criteria: Array<{
    name: string;
    weight: number;
    score: 1 | 2 | 3 | 4;
    normalized_score: number;
    weighted_points: number;
    summary: string;
    reasoning: string;
    violations: Array<{
      quoted_text: string;
      context_before: string;
      context_after: string;
      analysis: string;
      suggestion: string;
    }>;
  }>;
  usage?: TokenUsage;
};

export type CheckItem = {
  description: string;
  analysis: string;
  suggestion?: string;
  quoted_text?: string;
  context_before?: string;
  context_after?: string;
};

export type CheckResult = {
  type: typeof EvaluationType.CHECK;
  final_score: number; // 1-10
  percentage: number;
  violation_count: number;
  items: Array<CheckItem>;
  severity: typeof Severity.WARNING | typeof Severity.ERROR;
  message: string;
  violations: Array<{
    analysis: string;
    suggestion?: string;
    quoted_text?: string;
    context_before?: string;
    context_after?: string;
    criterionName?: string;
  }>;
  usage?: TokenUsage;
};

export type PromptEvaluationResult = JudgeResult | CheckResult;

export function isJudgeResult(
  result: PromptEvaluationResult
): result is JudgeResult {
  return result.type === EvaluationType.JUDGE;
}

export function isCheckResult(
  result: PromptEvaluationResult
): result is CheckResult {
  return result.type === EvaluationType.CHECK;
}
