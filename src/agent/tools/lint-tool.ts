import { LintToolInputSchema } from "../types";

export interface LintToolViolation {
  line: number;
  message: string;
  column?: number;
  suggestion?: string;
}

export interface LintToolResult {
  file: string;
  ruleSource: string;
  ruleId: string;
  violations: LintToolViolation[];
}

export interface RuleRegistryEntry {
  canonicalRuleId: string;
  prompt: string;
}

export type RuleRegistry = Record<string, RuleRegistryEntry>;

export interface LintRunContext {
  file: string;
  context?: string;
  ruleSource: string;
  ruleId: string;
  prompt: string;
}

export interface LintRunOutput {
  violations: LintToolViolation[];
}

export interface LintToolOptions {
  ruleRegistry: RuleRegistry;
  runRule: (context: LintRunContext) => Promise<LintRunOutput>;
}

export function createLintTool(options: LintToolOptions): {
  execute(input: unknown): Promise<LintToolResult>;
} {
  const validSources = Object.keys(options.ruleRegistry);

  return {
    async execute(input: unknown): Promise<LintToolResult> {
      const parsed = LintToolInputSchema.parse(input);
      const entry = options.ruleRegistry[parsed.ruleSource];

      if (!entry) {
        throw new Error(
          `Unknown ruleSource "${parsed.ruleSource}". Valid sources: ${validSources.join(
            ", "
          )}`
        );
      }

      const output = await options.runRule({
        file: parsed.file,
        context: parsed.context,
        ruleSource: parsed.ruleSource,
        ruleId: entry.canonicalRuleId,
        prompt: entry.prompt,
      });

      return {
        file: parsed.file,
        ruleSource: parsed.ruleSource,
        ruleId: entry.canonicalRuleId,
        violations: output.violations ?? [],
      };
    },
  };
}
