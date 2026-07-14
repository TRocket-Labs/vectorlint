import type { StructuredModelClient } from './structured-model-client';

/**
 * `LLMResult` lives on the permanent structured-output capability. It is
 * re-exported here so existing deep imports (`from './llm-provider'`) keep
 * compiling.
 */
export type { LLMResult } from './structured-model-client';

/**
 * The provider capability historically named `LLMProvider`. The autonomous
 * agent loop and the `Agent*` types that used to live here are removed (audit
 * Finding #2; Product Decision): the provider surface is now the permanent
 * {@link StructuredModelClient} structured-output capability, plus the bounded
 * {@link ToolCallingModelClient} transport implemented by concrete providers.
 *
 * Kept as an alias so existing evaluator and factory imports continue to
 * resolve the structured-output capability.
 */
export type LLMProvider = StructuredModelClient;
