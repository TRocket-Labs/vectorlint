import type { StructuredModelClient } from '../providers/structured-model-client';
import type { ToolCallingModelClient } from '../providers/tool-calling-model-client';
import type { RequestBuilder } from '../providers/request-builder';
import type { ReviewExecutor } from '../review/executor';
import { SingleModelCallExecutor } from './single-model-call-executor';
import { AgentModelCallExecutor } from './agent-model-call-executor';

/**
 * The model-client dependencies every executor composes. Both capabilities are
 * supplied because the resolved {@link ModelCall} is not known until
 * {@link chooseModelCall} runs at review time (audit Finding #2).
 */
export interface ExecutorDeps {
  structuredModelClient: StructuredModelClient;
  toolCallingModelClient: ToolCallingModelClient;
  builder: RequestBuilder;
}

/** A resolved reviewer model-call strategy (after `chooseModelCall`). */
export type ModelCall = 'single' | 'agent';

/**
 * Selects the {@link ReviewExecutor} for a resolved model call. `single` maps
 * to {@link SingleModelCallExecutor}; `agent` maps to
 * {@link AgentModelCallExecutor}. Callers resolve `auto` via
 * {@link chooseModelCall} before calling this factory.
 */
export function executorFor(modelCall: ModelCall, deps: ExecutorDeps): ReviewExecutor {
  if (modelCall === 'agent') {
    return new AgentModelCallExecutor(deps.toolCallingModelClient, deps.builder);
  }
  return new SingleModelCallExecutor(deps.structuredModelClient);
}

export { SingleModelCallExecutor } from './single-model-call-executor';
export { AgentModelCallExecutor } from './agent-model-call-executor';
export { TargetReadCapability } from './target-read-capability-adapter';
export { REVIEW_BUDGET_EXCEEDED_CODE, splitRuleId } from './shared';
