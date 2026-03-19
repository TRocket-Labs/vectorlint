import { z } from 'zod';
import type { LLMProvider } from '../providers/llm-provider';
import type { PromptFile } from '../schemas/prompt-schemas';
import type { TaskPlan } from './types';

const PLANNER_OUTPUT_SCHEMA = z.object({
  classifications: z.array(
    z.object({
      ruleId: z.string(),
      classification: z.enum(['lint', 'agent']),
      rationale: z.string(),
    })
  ),
});

const PLANNER_SYSTEM_PROMPT = `You are a documentation audit router. For each rule, classify it as either:
- "lint": the check can be done by reading a SINGLE document in isolation (e.g., passive voice, tone, clarity, wordiness, AI patterns, readability)
- "agent": the check requires reading MULTIPLE documents or files (e.g., terminology consistency across docs, information architecture, missing files, code-doc drift, cross-page redundancy)

When in doubt, classify as "lint". Only classify as "agent" if the check is impossible to do correctly by looking at one page at a time.`;

export async function runPlanner(
  rules: PromptFile[],
  targetFiles: string[],
  provider: LLMProvider
): Promise<TaskPlan> {
  const lintTasks: TaskPlan['lintTasks'] = [];
  const agentTasks: TaskPlan['agentTasks'] = [];

  const rulesWithMode = rules.filter((rule) => rule.meta.mode != null);
  const rulesWithoutMode = rules.filter((rule) => rule.meta.mode == null);

  for (const rule of rulesWithMode) {
    if (rule.meta.mode === 'agent') {
      agentTasks.push({ rule });
    } else {
      lintTasks.push({ rule, targetFiles });
    }
  }

  if (rulesWithoutMode.length === 0) {
    return { lintTasks, agentTasks };
  }

  const rulesContent = rulesWithoutMode
    .map((rule) => `Rule ID: ${rule.meta.id}\nRule content: ${rule.body.slice(0, 500)}`)
    .join('\n\n---\n\n');

  const result = await provider.runPromptStructured(rulesContent, PLANNER_SYSTEM_PROMPT, {
    name: 'planner_output',
    schema: {
      type: 'object',
      properties: {
        classifications: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              ruleId: { type: 'string' },
              classification: { type: 'string', enum: ['lint', 'agent'] },
              rationale: { type: 'string' },
            },
            required: ['ruleId', 'classification', 'rationale'],
          },
        },
      },
      required: ['classifications'],
    },
  });

  const parsed = PLANNER_OUTPUT_SCHEMA.safeParse(result.data);
  if (!parsed.success) {
    for (const rule of rulesWithoutMode) {
      lintTasks.push({ rule, targetFiles });
    }
    return { lintTasks, agentTasks };
  }

  const classMap = new Map(parsed.data.classifications.map((entry) => [entry.ruleId, entry.classification]));

  for (const rule of rulesWithoutMode) {
    const classification = classMap.get(rule.meta.id) ?? 'lint';
    if (classification === 'agent') {
      agentTasks.push({ rule });
    } else {
      lintTasks.push({ rule, targetFiles });
    }
  }

  return { lintTasks, agentTasks };
}
