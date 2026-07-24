import type { StructuredModelClient } from './structured-model-client';

/**
 * `LLMResult` lives on the permanent structured-output capability. It is
 * re-exported here so existing deep imports (`from './llm-provider'`) keep
 * compiling.
 */
export type { LLMResult } from './structured-model-client';

/** Compatibility alias for the structured-output provider capability. */
export type LLMProvider = StructuredModelClient;
