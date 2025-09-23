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
              evidence: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  quote: { type: 'string' },
                  pre: { type: 'string' },
                  post: { type: 'string' },
                },
                required: ['quote', 'pre', 'post'],
              },
              suggestion: { type: 'string' },
            },
            // Azure strict json_schema requires that `required` include every property key.
            // We require `suggestion` too (we'll ignore it when status is OK).
            required: ['name', 'weight', 'score', 'analysis', 'evidence', 'suggestion'],
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
    evidence: { quote: string; pre: string; post: string };
    suggestion?: string;
  }>;
};
