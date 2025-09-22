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
              analysis: { type: 'string' },
            },
            required: ['name', 'weight', 'score', 'analysis'],
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
    analysis: string;
  }>;
};
