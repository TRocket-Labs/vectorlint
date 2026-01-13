/**
 * Batched Prompt Builder
 *
 * Combines multiple Check rules into a single prompt for batch evaluation.
 */

import type { PromptFile } from "./prompt-loader";

export interface BatchedRuleContext {
  id: string;
  name: string;
  body: string;
}

const BATCHED_SYSTEM_PREAMBLE = `Evaluate the content against ${"{num_rules}"} distinct rules.

## PROTOCOL
For each rule listed below, you must:
1.  **Switch Context**: Focus ONLY on that specific rule's definition. Ignore others.
2.  **Scan**: Read the entire content looking for violations of THAT rule.
3.  **Log**: Record any violations found (or record an empty list if none).

## OUTPUT FORMAT
Return a JSON object with a "rules" array containing exactly ${"{num_rules}"} entries, one for each rule ID.

## RULES (TASKS)
`;

const RULE_SEPARATOR = "\n\n";

/**
 * Formats a single rule for inclusion in a batched prompt.
 * @param rule - The rule context containing id, name, and body
 * @returns Formatted string for the rule
 */
export function formatRuleForBatch(rule: BatchedRuleContext, index: number): string {
  return `### TASK ${index + 1}: Check Rule [${rule.id}] (${rule.name})
${rule.body}
--------------------------------------------------`;
}

/**
 * Builds a batched prompt from multiple Check rules.
 * Combines all rule prompts into a single system prompt with clear delineation.
 *
 * @param rules - Array of rules to batch together
 * @returns The combined system prompt for batched evaluation
 */
export function buildBatchedCheckPrompt(rules: BatchedRuleContext[]): string {
  if (rules.length === 0) {
    throw new Error("Cannot build batched prompt with zero rules");
  }

  const formattedRules = rules.map((r, i) => formatRuleForBatch(r, i)).join(RULE_SEPARATOR);

  // Inject the number of rules into the preamble
  const preamble = BATCHED_SYSTEM_PREAMBLE.replace(/\{num_rules\}/g, rules.length.toString());

  return `${preamble}
${formattedRules}

## VERIFICATION
You must output exactly ${rules.length} results. One for each Task above.
`;
}

/**
 * Extracts BatchedRuleContext from PromptFile objects.
 * Only extracts the essential information needed for batching.
 *
 * @param prompts - Array of PromptFile objects
 * @returns Array of BatchedRuleContext objects
 */
export function extractBatchedRuleContexts(
  prompts: PromptFile[]
): BatchedRuleContext[] {
  return prompts.map((p) => ({
    id: (p.meta.id || p.filename.replace(/\.md$/, "")).toString(),
    name: (p.meta.name || p.meta.id || p.filename).toString(),
    body: p.body,
  }));
}

/**
 * Groups rules into batches of a maximum size.
 */
export function groupIntoBatches<T>(
  rules: T[],
  maxBatchSize: number = 5
): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < rules.length; i += maxBatchSize) {
    batches.push(rules.slice(i, i + maxBatchSize));
  }
  return batches;
}
