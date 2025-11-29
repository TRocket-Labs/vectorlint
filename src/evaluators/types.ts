/**
 * Evaluator type constants to avoid magic strings.
 */
export const Type = {
    BASE: 'base',
    TECHNICAL_ACCURACY: 'technical-accuracy',
} as const;

export type TypeName = typeof Type[keyof typeof Type];
