import type { ToolCallDefinition, ToolCallingModelClient } from '../providers/tool-calling-model-client';
import type { ReviewCallContext, RequestBuilder } from '../providers/request-builder';
import {
  buildReviewLLMSchema,
  type ReviewLLMResult,
} from '../prompts/schema';
import { countWords } from '../chunking';
import { processFindings } from '../findings';
import { enforceBudget } from '../review/budget';
import type {
  ReviewDiagnostic,
  ReviewFinding,
  ReviewRequest,
  ReviewResult,
  ReviewRule,
  ReviewScore,
} from '../review/types';
import type { ReviewExecutor } from '../review/executor';
import { TargetReadCapability, buildReadTargetSectionTool } from './target-read-capability-adapter';
import {
  budgetExceededDiagnostic,
  buildReviewCallContext,
  buildReviewPrompt,
  buildReviewUsage,
  splitRuleId,
  toFindingSeverity,
  type RunCounters,
} from './shared';

/**
 * The agent `modelCall` {@link ReviewExecutor}.
 *
 * Reviews target content against source-backed rules through a single bounded
 * tool-calling run per rule via an injected {@link ToolCallingModelClient}. The
 * only executor-owned tool exposed to the model is `read_target_section`,
 * which pages through the in-memory `request.target.content`. Rule prompts come verbatim from
 * {@link ReviewRule.body} — no model-supplied rule override is introduced —
 * candidate findings flow through the shared {@link processFindings} pipeline,
 * and the model-call budget is enforced via the review budget module before
 * every call.
 *
 * This is the bounded, target-only review strategy selected by
 * `--model-call agent` (and by `auto` for large inputs).
 */
export class AgentModelCallExecutor implements ReviewExecutor {
  constructor(
    private readonly client: ToolCallingModelClient,
    private readonly builder: RequestBuilder,
  ) {}

  async run(request: ReviewRequest): Promise<ReviewResult> {
    const schema = buildReviewLLMSchema();
    const capability = new TargetReadCapability(request.target.content);
    // Exactly one executor-owned tool is exposed: target-section paging.
    const tools = buildReadTargetSectionTool(capability);
    const context = {
      ...buildReviewCallContext(request.target.uri),
      recordPayloadTelemetry: request.outputPolicy.recordPayloadTelemetry,
    };

    const findings: ReviewFinding[] = [];
    const scores: ReviewScore[] = [];
    const diagnostics: ReviewDiagnostic[] = [];
    let hadOperationalErrors = false;

    const counters: RunCounters = { modelCalls: 0, inputTokens: 0, outputTokens: 0 };
    const startedAt = Date.now();
    const elapsedMs = () => Date.now() - startedAt;

    try {
      for (const rule of request.rules) {
        const contentReview = await this.reviewTargetWithRule(
          request,
          rule,
          schema,
          tools,
          context,
          capability.lineCount,
          counters,
          elapsedMs,
        );
        findings.push(...contentReview.findings);
        scores.push(...contentReview.scores);
        diagnostics.push(...contentReview.diagnostics);
        if (contentReview.hadOperationalErrors) {
          hadOperationalErrors = true;
        }
      }
    } catch (error: unknown) {
      const diagnostic = budgetExceededDiagnostic(error);
      if (diagnostic) {
        hadOperationalErrors = true;
        diagnostics.push(diagnostic);
      } else {
        throw error;
      }
    }

    return {
      findings,
      scores,
      diagnostics,
      hadOperationalErrors,
      usage: buildReviewUsage(request, counters, elapsedMs()),
    };
  }

  /**
   * Reviews a single rule: makes one bounded tool-calling run that lets the
   * model page through the target via `read_target_section`, then projects the
   * returned violations through {@link processFindings}.
   */
  private async reviewTargetWithRule(
    request: ReviewRequest,
    rule: ReviewRule,
    schema: ReturnType<typeof buildReviewLLMSchema>,
    tools: Record<string, ToolCallDefinition>,
    context: ReviewCallContext,
    targetLineCount: number,
    counters: RunCounters,
    elapsedMs: () => number,
  ): Promise<ReviewResult> {
    // Enforce the model-call budget before committing to the run. The
    // prospective count (calls made so far plus this one) lets enforceBudget
    // reject the run that would push the review over maxModelCallsPerReview.
    enforceBudget(request.budget, {
      modelCalls: counters.modelCalls + 1,
      elapsedMs: elapsedMs(),
    });

    const { data, usage } = await this.client.runWithTools<ReviewLLMResult>({
      // The source-backed rule body, wrapped with the directive/user
      // instructions exactly as the single-call path does. No model-supplied
      // rule override is introduced.
      systemPrompt: this.builder.buildPromptBodyForStructured(
        buildReviewPrompt(rule.body, request.context),
        context,
      ),
      prompt: this.buildTargetPrompt(request.target.uri, targetLineCount),
      tools,
      schema,
      options: {
        // Each run is bounded by the budget's per-rule section limit: the
        // model may page through at most maxChunksPerRule sections before
        // emitting its structured finding set.
        maxSteps: request.budget.maxChunksPerRule,
        maxParallelToolCalls: 1,
        recordPayloadTelemetry: request.outputPolicy.recordPayloadTelemetry,
      },
    });

    counters.modelCalls += 1;
    if (usage) {
      counters.inputTokens += usage.inputTokens;
      counters.outputTokens += usage.outputTokens;
    }

    const { pack, ruleId } = splitRuleId(rule.id);
    const wordCount = countWords(request.target.content) || 1;

    return processFindings({
      pack,
      ruleId,
      ruleSource: rule.source,
      candidateFindings: data.violations,
      wordCount,
      promptMeta: {
        ...(rule.severity !== undefined ? { severity: toFindingSeverity(rule.severity) } : {}),
      },
      targetContent: request.target.content,
    });
  }

  private buildTargetPrompt(uri: string, lineCount: number): string {
    return [
      `Target URI: ${uri}`,
      `Target lines: ${lineCount}`,
      '',
      'Page through the target with the read_target_section tool, then report verified violations in the structured output.',
    ].join('\n');
  }
}
