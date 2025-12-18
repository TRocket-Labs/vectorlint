export interface TokenUsage {
    inputTokens: number;
    outputTokens: number;
}

export interface TokenUsageStats {
    totalInputTokens: number;
    totalOutputTokens: number;
    totalCost?: number; // Only set if pricing configured
}

export interface PricingConfig {
    inputPricePerMillion?: number;
    outputPricePerMillion?: number;
}

/**
 * Calculates the cost for a given token usage and pricing configuration.
 * Returns undefined if pricing is insufficient (missing input/output prices).
 */
export function calculateCost(usage: TokenUsage, pricing?: PricingConfig): number | undefined {
    if (!pricing || pricing.inputPricePerMillion === undefined || pricing.outputPricePerMillion === undefined) {
        return undefined;
    }

    const inputCost = (usage.inputTokens / 1_000_000) * pricing.inputPricePerMillion;
    const outputCost = (usage.outputTokens / 1_000_000) * pricing.outputPricePerMillion;

    return inputCost + outputCost;
}
