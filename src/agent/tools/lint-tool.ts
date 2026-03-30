import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import type { LLMProvider } from '../../providers/llm-provider.js';
import type { PromptFile } from '../../schemas/prompt-schemas.js';
import { createEvaluator } from '../../evaluators/index.js';
import { Type } from '../../evaluators/types.js';
import { isJudgeResult } from '../../prompts/schema.js';
import { calculateCheckScore } from '../../scoring/index.js';
import { computeFilterDecision } from '../../evaluators/violation-filter.js';
import { resolveToCwd, isWithinRoot } from './path-utils.js';

export interface LintToolResult {
  score: number;
  violationCount: number;
  violations: Array<{ line: number; message: string }>;
}

export interface LintTool {
  name: 'lint';
  description: string;
  execute(params: {
    file: string;
    ruleKey?: string;
    ruleId?: string;
    ruleContent: string;
    context?: string;
  }): Promise<LintToolResult>;
}

type LintRuleCatalog = Map<string, PromptFile>;
type LintRuleSource = PromptFile | LintRuleCatalog;

export function createLintTool(
  cwd: string,
  rulesByIdMap: LintRuleSource,
  provider: LLMProvider
): LintTool {
  const isRuleCatalog = rulesByIdMap instanceof Map;

  function resolveRule(ruleKey?: string, ruleId?: string): PromptFile {
    if (isRuleCatalog) {
      if (ruleKey) {
        const rule = rulesByIdMap.get(ruleKey);
        if (!rule) {
          throw new Error(`Unknown ruleKey: ${ruleKey}`);
        }
        return rule;
      }

      if (ruleId) {
        const matches = Array.from(rulesByIdMap.values()).filter((candidate) => candidate.meta.id === ruleId);
        if (matches.length === 1 && matches[0]) {
          return matches[0];
        }
        if (matches.length > 1) {
          throw new Error(`Ambiguous ruleId: ${ruleId}. Use ruleKey instead.`);
        }
        throw new Error(`Unknown ruleId: ${ruleId}`);
      }

      if (!ruleId) {
        throw new Error('ruleKey is required when lint is configured with a rules catalog.');
      }
    }

    if (ruleId && ruleId !== rulesByIdMap.meta.id) {
      throw new Error(`Unknown ruleId: ${ruleId}`);
    }

    return rulesByIdMap;
  }

  return {
    name: 'lint',
    description: 'Run per-page VectorLint evaluation on a single file. Provide ruleContent (rule body only, no YAML frontmatter) and optional context from external evidence.',

    async execute({ file, ruleKey, ruleId, ruleContent, context }) {
      const absolutePath = resolveToCwd(file, cwd);

      if (!isWithinRoot(absolutePath, cwd)) {
        throw new Error(`Path traversal blocked: ${file} is outside the allowed root`);
      }

      const content = readFileSync(absolutePath, 'utf-8');
      const relFile = path.relative(cwd, absolutePath);
      const rule = resolveRule(ruleKey, ruleId);

      const normalizedRuleContent = ruleContent.trim();
      if (normalizedRuleContent.length === 0) {
        throw new Error('ruleContent must not be empty. Provide the rule criteria body without YAML frontmatter.');
      }

      const normalizedContext = context?.trim();
      const contextualRuleBody = normalizedContext && normalizedContext.length > 0
        ? `${normalizedRuleContent}\n\n---\n\nAdditional grounding context (external evidence gathered by the agent):\n${normalizedContext}`
        : normalizedRuleContent;

      const evaluationRule: PromptFile = {
        ...rule,
        body: contextualRuleBody,
      };

      const evaluator = createEvaluator(Type.BASE, provider, evaluationRule);
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

      const surfacedViolations = result.violations.filter(
        (violation) => computeFilterDecision(violation).surface
      );

      const violations = surfacedViolations
        .filter((violation) => violation.line != null)
        .map((violation) => ({
          line: violation.line as number,
          message: violation.message ?? violation.description ?? '',
        }));

      const scored = calculateCheckScore(
        surfacedViolations,
        result.word_count,
        {
          strictness: rule.meta.strictness,
          promptSeverity: rule.meta.severity,
        }
      );

      return {
        score: scored.final_score,
        violationCount: violations.length,
        violations,
      };
    },
  };
}
