export function buildCriteriaJsonSchema() {
  return {
    name: 'vectorlint_criteria_result',
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
              weight: { type: 'number' },
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
            // Azure strict json_schema requires that `required` include every property key.
            // We require `summary`, `reasoning`, and `violations` to ensure positive remarks, reasoning, and findings are captured.
            required: ['name', 'weight', 'score', 'summary', 'reasoning', 'violations'],
          },
        },
      },
      required: ['criteria'],
    },
  } as const;
}

export function buildBasicJsonSchema() {
  return {
    name: 'vectorlint_basic_result',
    strict: true,
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        status: { type: 'string', enum: ['ok', 'warning', 'error'] },
        message: { type: 'string' },
        violations: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              analysis: { type: 'string' },
              suggestion: { type: 'string' },
              pre: { type: 'string' },
              post: { type: 'string' },
              criterionName: { type: 'string' },
            },
            required: ['analysis'],
          },
        },
      },
      required: ['status', 'message', 'violations'],
    },
  } as const;
}

export type BasicResult = {
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

export type CriteriaResult = {
  criteria: Array<{
    name: string;
    weight: number;
    score: 0 | 1 | 2 | 3 | 4;
    summary: string;
    reasoning: string;
    violations: Array<{ pre: string; post: string; analysis: string; suggestion: string }>;
  }>;
};

export type EvaluationResult = BasicResult | CriteriaResult;

export function isCriteriaResult(result: EvaluationResult): result is CriteriaResult {
  return 'criteria' in result;
}
