import { z } from 'zod';

/**
 * Mock parameter schemas for type-safe test utilities
 * These schemas validate constructor parameters for mock error classes
 */

export const MOCK_ERROR_PARAMS_SCHEMA = z.object({
  message: z.string(),
  status: z.number().optional(),
  options: z.unknown().optional(),
  body: z.unknown().optional(),
  headers: z.record(z.string()).optional(),
});

export const MOCK_API_ERROR_PARAMS_SCHEMA = z.object({
  message: z.string(),
  status: z.number().optional(),
  options: z.unknown().optional(),
  body: z.unknown().optional(),
});

export const MOCK_AUTHENTICATION_ERROR_PARAMS_SCHEMA = z.object({
  message: z.string().default('Unauthorized'),
  options: z.unknown().optional(),
  body: z.unknown().optional(),
  headers: z.record(z.string()).optional(),
});

export const MOCK_RATE_LIMIT_ERROR_PARAMS_SCHEMA = z.object({
  message: z.string().default('Rate Limited'),
  options: z.unknown().optional(),
  body: z.unknown().optional(),
  headers: z.record(z.string()).optional(),
});

export const MOCK_BAD_REQUEST_ERROR_PARAMS_SCHEMA = z.object({
  message: z.string(),
  options: z.unknown().optional(),
  body: z.unknown().optional(),
  headers: z.record(z.string()).optional(),
});

// Inferred TypeScript types
export type MockErrorParams = z.infer<typeof MOCK_ERROR_PARAMS_SCHEMA>;
export type MockAPIErrorParams = z.infer<typeof MOCK_API_ERROR_PARAMS_SCHEMA>;
export type MockAuthenticationErrorParams = z.infer<typeof MOCK_AUTHENTICATION_ERROR_PARAMS_SCHEMA>;
export type MockRateLimitErrorParams = z.infer<typeof MOCK_RATE_LIMIT_ERROR_PARAMS_SCHEMA>;
export type MockBadRequestErrorParams = z.infer<typeof MOCK_BAD_REQUEST_ERROR_PARAMS_SCHEMA>;

/**
 * Type-safe interfaces for mock client objects
 */

export interface MockOpenAIClient {
  chat: {
    completions: {
      create: (params: unknown) => Promise<unknown>;
    };
  };
  responses?: {
    create: (params: unknown) => Promise<unknown>;
  };
}

export interface MockAnthropicClient {
  messages: {
    create: (params: unknown) => Promise<unknown>;
  };
}

/**
 * Utility functions for mock parameter validation
 */

export function validateMockErrorParams(params: unknown): MockErrorParams {
  return MOCK_ERROR_PARAMS_SCHEMA.parse(params);
}

export function validateMockAPIErrorParams(params: unknown): MockAPIErrorParams {
  return MOCK_API_ERROR_PARAMS_SCHEMA.parse(params);
}

export function validateMockAuthenticationErrorParams(params: unknown): MockAuthenticationErrorParams {
  return MOCK_AUTHENTICATION_ERROR_PARAMS_SCHEMA.parse(params);
}

export function validateMockRateLimitErrorParams(params: unknown): MockRateLimitErrorParams {
  return MOCK_RATE_LIMIT_ERROR_PARAMS_SCHEMA.parse(params);
}

export function validateMockBadRequestErrorParams(params: unknown): MockBadRequestErrorParams {
  return MOCK_BAD_REQUEST_ERROR_PARAMS_SCHEMA.parse(params);
}

/**
 * Mock client factory functions with type safety
 */

export function createMockOpenAIClient(createFn: (params: unknown) => Promise<unknown>): MockOpenAIClient {
  return {
    chat: {
      completions: {
        create: createFn,
      },
    },
    responses: {
      create: createFn,
    },
  };
}

export function createMockAnthropicClient(createFn: (params: unknown) => Promise<unknown>): MockAnthropicClient {
  return {
    messages: {
      create: createFn,
    },
  };
}


/**
 * Perplexity mock schemas + factory for tests
 */

export const MOCK_PERPLEXITY_SEARCH_PARAMS_SCHEMA = z.object({
  query: z.string(),
  max_results: z.number().optional(),
  max_tokens_per_page: z.number().optional(),
});

export type MockPerplexitySearchParams = z.infer<typeof MOCK_PERPLEXITY_SEARCH_PARAMS_SCHEMA>;

export interface MockPerplexityClient {
  search: {
    create: (params: MockPerplexitySearchParams) => Promise<unknown>;
  };
}

/**
 * Factory that validates params at runtime and forwards to provided createFn.
 */
export function createMockPerplexityClient(
  createFn: (params: MockPerplexitySearchParams) => Promise<unknown>
): MockPerplexityClient {
  return {
    search: {
      create: async (params: MockPerplexitySearchParams) => {
        MOCK_PERPLEXITY_SEARCH_PARAMS_SCHEMA.parse(params);
        return createFn(params);
      },
    },
  };
}
