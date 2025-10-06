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
                    quote: { type: 'string' },
                    pre: { type: 'string' },
                    post: { type: 'string' },
                    analysis: { type: 'string' },
                    suggestion: { type: 'string' },
                  },
                  required: ['quote', 'pre', 'post', 'analysis', 'suggestion'],
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

export type CriteriaResult = {
  criteria: Array<{
    name: string;
    weight: number;
    score: 0 | 1 | 2 | 3 | 4;
    summary: string;
    reasoning: string;
    violations: Array<{ quote: string; pre: string; post: string; analysis: string; suggestion: string }>;
  }>;
};
