import type { PromptFile } from "../prompts/prompt-loader";
import { canonicalRuleIdFromPackRule, ruleSourceFromPrompt } from "../prompts/rule-identity";
import {
  TopLevelReportInputSchema,
  type AgentFinding,
} from "./types";
import { createReviewSessionStore } from "./review-session-store";
import { mergeAgentFindings } from "./merger";
import {
  createLintTool,
  type LintRunContext,
  type LintRunOutput,
  type LintToolResult,
  type RuleRegistry,
} from "./tools/lint-tool";

export interface RuleSourceRegistryEntry {
  canonicalRuleId: string;
  prompt: string;
  allowedFiles: string[];
}

export interface AgentToolset {
  lint: (input: unknown) => Promise<LintToolResult>;
  report_finding: (input: unknown) => Promise<AgentFinding>;
  finalize_review: (input?: { totalFindings?: number }) => Promise<void>;
}

export interface RunAgentExecutorParams {
  targets: string[];
  prompts: PromptFile[];
  homeDir?: string;
  runRule?: (context: LintRunContext) => Promise<LintRunOutput>;
  executeAgent?: (tools: AgentToolset) => Promise<void>;
}

export interface RunAgentExecutorResult {
  sessionId: string;
  sessionFilePath: string;
  validRuleSources: string[];
  findings: AgentFinding[];
  finalized: boolean;
  ruleSourceRegistry: Record<string, RuleSourceRegistryEntry>;
  fileRuleMap: Record<string, string[]>;
}

function buildRuleSourceRegistry(
  targets: string[],
  prompts: PromptFile[]
): {
  registry: Record<string, RuleSourceRegistryEntry>;
  fileRuleMap: Record<string, string[]>;
} {
  const registry: Record<string, RuleSourceRegistryEntry> = {};
  const fileRuleMap: Record<string, string[]> = {};

  for (const file of targets) {
    fileRuleMap[file] = [];
  }

  for (const prompt of prompts) {
    const ruleSource = ruleSourceFromPrompt(prompt);
    const canonicalRuleId = canonicalRuleIdFromPackRule(
      prompt.pack || "Default",
      prompt.meta.id || prompt.id || prompt.filename
    );

    if (!registry[ruleSource]) {
      registry[ruleSource] = {
        canonicalRuleId,
        prompt: prompt.body,
        allowedFiles: [...targets],
      };
    }

    for (const file of targets) {
      if (!fileRuleMap[file]) {
        fileRuleMap[file] = [];
      }
      fileRuleMap[file]!.push(ruleSource);
    }
  }

  return { registry, fileRuleMap };
}

export async function runAgentExecutor(
  params: RunAgentExecutorParams
): Promise<RunAgentExecutorResult> {
  const { registry, fileRuleMap } = buildRuleSourceRegistry(
    params.targets,
    params.prompts
  );
  const validRuleSources = Object.keys(registry).sort();
  let findings: AgentFinding[] = [];

  const store = await createReviewSessionStore({
    ...(params.homeDir ? { homeDir: params.homeDir } : {}),
  });
  await store.append({
    eventType: "session_started",
    payload: { cwd: process.cwd() },
  });

  const lintTool = createLintTool({
    ruleRegistry: registry as RuleRegistry,
    runRule: params.runRule ?? (async () => ({ violations: [] })),
  });

  let finalized = false;

  const tools: AgentToolset = {
    lint: async (input): Promise<LintToolResult> => {
      await store.append({
        eventType: "tool_call_started",
        payload: { toolName: "lint", input },
      });

      try {
        const result = await lintTool.execute(input);
        for (const violation of result.violations) {
          const finding: AgentFinding = {
            kind: "inline",
            ruleSource: result.ruleSource,
            ruleId: result.ruleId,
            file: result.file,
            line: violation.line,
            ...(violation.column ? { column: violation.column } : {}),
            message: violation.message,
            ...(violation.suggestion ? { suggestion: violation.suggestion } : {}),
          };
          const recordedEvent = await store.append({
            eventType: "finding_recorded_inline",
            payload: { finding },
          });
          findings = mergeAgentFindings(findings, [recordedEvent.payload.finding]);
        }

        await store.append({
          eventType: "tool_call_finished",
          payload: { toolName: "lint", ok: true, output: result },
        });

        return result;
      } catch (error: unknown) {
        await store.append({
          eventType: "tool_call_finished",
          payload: {
            toolName: "lint",
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          },
        });
        throw error;
      }
    },
    report_finding: async (input): Promise<AgentFinding> => {
      await store.append({
        eventType: "tool_call_started",
        payload: { toolName: "report_finding", input },
      });

      try {
        const parsed = TopLevelReportInputSchema.parse(input);
        const entry = registry[parsed.ruleSource];
        if (!entry) {
          throw new Error(
            `Unknown ruleSource "${parsed.ruleSource}". Valid sources: ${validRuleSources.join(
              ", "
            )}`
          );
        }

        const firstReference = parsed.references?.[0];
        const finding: AgentFinding = {
          kind: "top-level",
          ruleSource: parsed.ruleSource,
          ruleId: entry.canonicalRuleId,
          message: parsed.message,
          ...(firstReference?.file ? { file: firstReference.file } : {}),
          ...(firstReference?.startLine ? { line: firstReference.startLine } : {}),
        };
        const recordedEvent = await store.append({
          eventType: "finding_recorded_top_level",
          payload: { finding },
        });
        findings = mergeAgentFindings(findings, [recordedEvent.payload.finding]);

        await store.append({
          eventType: "tool_call_finished",
          payload: { toolName: "report_finding", ok: true, output: finding },
        });

        return finding;
      } catch (error: unknown) {
        await store.append({
          eventType: "tool_call_finished",
          payload: {
            toolName: "report_finding",
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          },
        });
        throw error;
      }
    },
    finalize_review: async (input): Promise<void> => {
      await store.append({
        eventType: "tool_call_started",
        payload: { toolName: "finalize_review", input: input ?? {} },
      });

      await store.append({
        eventType: "session_finalized",
        payload: {
          totalFindings: input?.totalFindings ?? findings.length,
        },
      });

      await store.append({
        eventType: "tool_call_finished",
        payload: { toolName: "finalize_review", ok: true, output: input ?? {} },
      });
      finalized = true;
    },
  };

  if (params.executeAgent) {
    await params.executeAgent(tools);
  } else {
    for (const file of params.targets) {
      for (const ruleSource of fileRuleMap[file] ?? []) {
        await tools.lint({ file, ruleSource });
      }
    }
    await tools.finalize_review({ totalFindings: findings.length });
  }

  return {
    sessionId: store.sessionId,
    sessionFilePath: store.sessionFilePath,
    validRuleSources,
    findings,
    finalized,
    ruleSourceRegistry: registry,
    fileRuleMap,
  };
}
