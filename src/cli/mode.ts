export const EVALUATION_MODES = ['lint', 'agent'] as const;

export type EvaluationMode = (typeof EVALUATION_MODES)[number];

export const DEFAULT_EVALUATION_MODE: EvaluationMode = 'lint';
export const AGENT_EVALUATION_MODE: EvaluationMode = 'agent';
