import type { LLMProvider } from '../providers/llm-provider';
import type { PromptFile } from '../schemas/prompt-schemas';
import {
  buildBasicJsonSchema,
  buildCriteriaJsonSchema,
  type BasicResult,
  type CriteriaResult,
  type EvaluationResult,
} from '../prompts/schema';
import { registerEvaluator } from './evaluator-registry';
import type { Evaluator } from './evaluator';

/*
 * Core LLM-based evaluator that handles both scored and basic evaluation modes.
 * Mode is determined by prompt frontmatter:
 * - criteria defined → scored mode (CriteriaResult)
 * - no criteria → basic mode (BasicResult)
 *
 * Subclasses can override protected methods to customize evaluation behavior
 * while reusing the core evaluation logic.
 */
export class BaseEvaluator implements Evaluator {
  constructor(
    protected llmProvider: LLMProvider,
    protected prompt: PromptFile
  ) {}

  async evaluate(_file: string, content: string): Promise<EvaluationResult> {
    if (this.hasScoringCriteria()) {
      return this.runScoredEvaluation(content);
    }
    return this.runBasicEvaluation(content);
  }

  /*
   * Determines if the prompt has scoring criteria defined.
   * Used to select between scored and basic evaluation modes.
   */
  protected hasScoringCriteria(): boolean {
    return (
      Array.isArray(this.prompt.meta.criteria) &&
      this.prompt.meta.criteria.length > 0
    );
  }

  /*
   * Runs scored evaluation using criteria-based rubric.
   * Returns CriteriaResult with scores for each criterion.
   */
  protected async runScoredEvaluation(content: string): Promise<CriteriaResult> {
    const schema = buildCriteriaJsonSchema();
    return this.llmProvider.runPromptStructured<CriteriaResult>(
      content,
      this.prompt.body,
      schema
    );
  }

  /*
   * Runs basic evaluation with pass/warn/fail status.
   * Returns BasicResult with status, message, and violations.
   */
  protected async runBasicEvaluation(content: string): Promise<BasicResult> {
    const schema = buildBasicJsonSchema();
    const systemPrompt = this.buildBasicSystemPrompt();
    return this.llmProvider.runPromptStructured<BasicResult>(
      content,
      systemPrompt,
      schema
    );
  }

  /*
   * Builds the system prompt for basic evaluation mode.
   * Wraps the user's prompt with structured output instructions.
   */
  private buildBasicSystemPrompt(): string {
    const hasCriteria = this.hasScoringCriteria();
    let criteriaList = '';

    if (hasCriteria) {
      criteriaList =
        '\n\nYou should evaluate the content based on these specific criteria:\n';
      for (const c of this.prompt.meta.criteria!) {
        criteriaList += `- ${c.name} (id: ${c.id})\n`;
      }
      criteriaList +=
        '\nWhen reporting violations, include the "criterionName" field with the name of the criterion that was violated.';
    }

    return `
You are an expert content evaluator.
Your task is to evaluate the provided content based on the following instruction:
"${this.prompt.body}"
${criteriaList}

You must output your evaluation in the specific JSON format requested.
- 'status': 'ok' (pass), 'warning' (minor issues), or 'error' (fail).
- 'message': A brief summary of the evaluation.
- 'violations': A list of specific issues found (if any). Each violation should have:
  - 'analysis': description of the issue
  - 'suggestion': (optional) how to fix it
  - 'pre': (optional) text before the issue
  - 'post': (optional) text after the issue
  ${hasCriteria ? "- 'criterionName': the name of the criterion this violation relates to" : ''}
`;
  }
}

// Register as default evaluator for base type
registerEvaluator('base', (llmProvider, prompt) => new BaseEvaluator(llmProvider, prompt));
