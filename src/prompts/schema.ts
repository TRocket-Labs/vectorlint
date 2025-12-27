import { EvaluationType, Severity } from "../evaluators/types";

export function buildSubjectiveLLMSchema() {
  return {
    name: "vectorlint_subjective_result",
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

export function buildSemiObjectiveLLMSchema() {
  return {
    name: "vectorlint_semi_objective_result",
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

export type SubjectiveLLMResult = {
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

export type SemiObjectiveLLMResult = {
  violations: Array<{
    description: string;
    analysis: string;
    suggestion?: string;
    quoted_text?: string;
    context_before?: string;
    context_after?: string;
  }>;
};

export type SubjectiveResult = {
  type: typeof EvaluationType.SUBJECTIVE;
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
};

export type SemiObjectiveItem = {
  description: string;
  analysis: string;
  suggestion?: string;
  quoted_text?: string;
  context_before?: string;
  context_after?: string;
};

export type SemiObjectiveResult = {
  type: typeof EvaluationType.SEMI_OBJECTIVE;
  final_score: number; // 1-10
  percentage: number;
  passed_count: number;
  total_count: number;
  items: Array<SemiObjectiveItem>;
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
};

export type EvaluationResult = SubjectiveResult | SemiObjectiveResult;

export function isSubjectiveResult(
  result: EvaluationResult
): result is SubjectiveResult {
  return result.type === EvaluationType.SUBJECTIVE;
}

export function isSemiObjectiveResult(
  result: EvaluationResult
): result is SemiObjectiveResult {
  return result.type === EvaluationType.SEMI_OBJECTIVE;
}
