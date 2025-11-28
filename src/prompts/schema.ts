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
              score: { type: 'number', enum: [0, 1, 2, 3, 4] },
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
        items: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              description: { type: 'string' },
              passed: { type: 'boolean' },
              analysis: { type: 'string' },
              suggestion: { type: 'string' },
              pre: { type: 'string' },
              post: { type: 'string' },
            },
            required: ['description', 'passed', 'analysis', 'suggestion', 'pre', 'post'],
          },
        },
      },
      required: ['items'],
    },
  } as const;
}

export type SubjectiveLLMResult = {
  criteria: Array<{
    name: string;
    score: 0 | 1 | 2 | 3 | 4;
    summary: string;
    reasoning: string;
    violations: Array<{ pre: string; post: string; analysis: string; suggestion: string }>;
  }>;
};

export type SemiObjectiveLLMResult = {
  items: Array<{
    description: string;
    passed: boolean;
    analysis: string;
    suggestion?: string;
    pre?: string;
    post?: string;
  }>;
};

export type SubjectiveResult = {
  type: 'subjective';
  final_score: number; // 1-10
  criteria: Array<{
    name: string;
    weight: number;
    score: 0 | 1 | 2 | 3 | 4;
    weighted_points: number;
    summary: string;
    reasoning: string;
    violations: Array<{ pre: string; post: string; analysis: string; suggestion: string }>;
  }>;
};

export type SemiObjectiveResult = {
  type: 'semi-objective';
  final_score: number; // 1-10
  percentage: number;
  passed_count: number;
  total_count: number;
  items: Array<{
    description: string;
    passed: boolean;
    analysis: string;
    suggestion?: string;
    pre?: string;
    post?: string;
  }>;
  // Backward compatibility with old BasicResult
  status: 'ok' | 'warning' | 'error';
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
  return result.type === 'subjective';
}

export function isSemiObjectiveResult(result: EvaluationResult): result is SemiObjectiveResult {
  return result.type === 'semi-objective';
}
