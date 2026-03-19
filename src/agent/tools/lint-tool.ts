import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import type { LLMProvider } from '../../providers/llm-provider.js';
import type { PromptFile } from '../../schemas/prompt-schemas.js';
import { createEvaluator } from '../../evaluators/index.js';
import { Type } from '../../evaluators/types.js';
import { isJudgeResult } from '../../prompts/schema.js';
import { resolveToCwd, isWithinRoot } from './path-utils.js';

export interface LintToolResult {
  score: number;
  violationCount: number;
  violations: Array<{ line: number; message: string }>;
}

export interface LintTool {
  name: 'lint';
  description: string;
  execute(params: { file: string; ruleId: string }): Promise<LintToolResult>;
}

export function createLintTool(
  cwd: string,
  rules: PromptFile[],
  provider: LLMProvider
): LintTool {
  return {
    name: 'lint',
    description: 'Run per-page VectorLint evaluation on a single file against a specific rule. Returns score and violations. Use ruleId from the rule\'s frontmatter id field.',

    async execute({ file, ruleId }) {
      const absolutePath = resolveToCwd(file, cwd);

      if (!isWithinRoot(absolutePath, cwd)) {
        throw new Error(`Path traversal blocked: ${file} is outside the allowed root`);
      }

      const rule = rules.find((r) => r.meta.id === ruleId);
      if (!rule) {
        const availableRules = rules.map((r) => r.meta.id).join(', ');
        throw new Error(`Rule not found: ${ruleId}. Available rules: ${availableRules}`);
      }

      const content = readFileSync(absolutePath, 'utf-8');
      const relFile = path.relative(cwd, absolutePath);

      const evaluator = createEvaluator(Type.BASE, provider, rule);
      const result = await evaluator.evaluate(relFile, content);

      if (isJudgeResult(result)) {
        const violations = result.criteria.flatMap((criterion) =>
          criterion.violations.map((violation) => ({
            line: violation.line,
            message: violation.message,
          }))
        );

        return {
          score: result.final_score,
          violationCount: violations.length,
          violations,
        };
      }

      const violations = result.violations
        .filter((violation) => violation.line != null)
        .map((violation) => ({
          line: violation.line as number,
          message: violation.message ?? violation.description ?? '',
        }));

      return {
        score: 0,
        violationCount: violations.length,
        violations,
      };
    },
  };
}
