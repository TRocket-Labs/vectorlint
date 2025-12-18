import { describe, it, expect } from 'vitest';
import { calculateCost, TokenUsage, PricingConfig } from '../src/types/token-usage';

describe('Token Usage Calculation', () => {
    it('should calculate cost correctly when pricing provided', () => {
        const usage: TokenUsage = {
            inputTokens: 1_000_000,
            outputTokens: 1_000_000
        };
        const pricing: PricingConfig = {
            inputPricePerMillion: 5.0,
            outputPricePerMillion: 15.0
        };

        const cost = calculateCost(usage, pricing);
        expect(cost).toBe(20.0);
    });

    it('should calculate cost correctly for partial millions', () => {
        const usage: TokenUsage = {
            inputTokens: 500_000, // 0.5 * 10 = 5
            outputTokens: 100_000 // 0.1 * 30 = 3
        };
        const pricing: PricingConfig = {
            inputPricePerMillion: 10.0,
            outputPricePerMillion: 30.0
        };

        const cost = calculateCost(usage, pricing);
        expect(cost).toBe(8.0);
    });

    it('should return undefined if pricing is undefined', () => {
        const usage: TokenUsage = { inputTokens: 100, outputTokens: 100 };
        expect(calculateCost(usage, undefined)).toBeUndefined();
    });

    it('should return undefined if input pricing is missing', () => {
        const usage: TokenUsage = { inputTokens: 100, outputTokens: 100 };
        const pricing: PricingConfig = { outputPricePerMillion: 10.0 };
        expect(calculateCost(usage, pricing)).toBeUndefined();
    });

    it('should return undefined if output pricing is missing', () => {
        const usage: TokenUsage = { inputTokens: 100, outputTokens: 100 };
        const pricing: PricingConfig = { inputPricePerMillion: 10.0 };
        expect(calculateCost(usage, pricing)).toBeUndefined();
    });

    it('should handle zero tokens', () => {
        const usage: TokenUsage = { inputTokens: 0, outputTokens: 0 };
        const pricing: PricingConfig = { inputPricePerMillion: 10, outputPricePerMillion: 10 };
        expect(calculateCost(usage, pricing)).toBe(0);
    });
});
