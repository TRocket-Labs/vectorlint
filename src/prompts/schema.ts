import { EvaluationType, Severity } from '../evaluators/types';

export function buildSubjectiveLLMSchema() {
  return {
    name: 'vectorlint_subjective_result',
    strict: true,
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        criteria: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              name: { type: 'string' },
              score: { type: 'number', enum: [1, 2, 3, 4] },
              summary: { type: 'string' },
              reasoning: { type: 'string' },
              violations: {
                type: 'array',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    pre: { type: 'string' },
                    post: { type: 'string' },
                    analysis: { type: 'string' },
                    suggestion: { type: 'string' },
                  },
                  required: ['pre', 'post', 'analysis', 'suggestion'],
                },
              },
            },
            required: ['name', 'score', 'summary', 'reasoning', 'violations'],
          },
        },
      },
      required: ['criteria'],
    },
  } as const;
}

export function buildSemiObjectiveLLMSchema() {
  return {
    name: 'vectorlint_semi_objective_result',
    strict: true,
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        violations: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              description: { type: 'string' },
              analysis: { type: 'string' },
              suggestion: { type: 'string' },
              pre: { type: 'string' },
              post: { type: 'string' },
            },
            required: ['description', 'analysis', 'suggestion', 'pre', 'post'],
          },
        },
      },
      required: ['violations'],
    },
  } as const;
}

export type SubjectiveLLMResult = {
  criteria: Array<{
    name: string;
    score: 1 | 2 | 3 | 4;
    summary: string;
    reasoning: string;
    violations: Array<{ pre: string; post: string; analysis: string; suggestion: string }>;
  }>;
};

export type SemiObjectiveLLMResult = {
  violations: Array<{
    description: string;
    analysis: string;
    suggestion?: string;
    pre?: string;
    post?: string;
  }>;
};

export type SubjectiveResult = {
  type: typeof EvaluationType.SUBJECTIVE;
  final_score: number; // 1-10
  criteria: Array<{
    name: string;
    weight: number;
    score: 1 | 2 | 3 | 4;
    weighted_points: number;
    summary: string;
    reasoning: string;
    violations: Array<{ pre: string; post: string; analysis: string; suggestion: string }>;
  }>;
};

export type SemiObjectiveItem = {
  description: string;
  analysis: string;
  suggestion?: string;
  pre?: string;
  post?: string;
};

export type SemiObjectiveResult = {
  type: typeof EvaluationType.SEMI_OBJECTIVE;
  final_score: number; // 1-10
  percentage: number;
  passed_count: number;
  total_count: number;
  items: Array<SemiObjectiveItem>;
  // Backward compatibility with old BasicResult
  status?: typeof Severity.WARNING | typeof Severity.ERROR;
  message: string;
  violations: Array<{
    analysis: string;
    suggestion?: string;
    pre?: string;
    post?: string;
    criterionName?: string;
  }>;
};

export type EvaluationResult = SubjectiveResult | SemiObjectiveResult;

export function isSubjectiveResult(result: EvaluationResult): result is SubjectiveResult {
  return result.type === EvaluationType.SUBJECTIVE;
}

export function isSemiObjectiveResult(result: EvaluationResult): result is SemiObjectiveResult {
  return result.type === EvaluationType.SEMI_OBJECTIVE;
}
