import { BaseEvaluator } from './evaluator';
import type { LLMProvider } from '../providers/llm-provider';
import type { PromptFile } from '../schemas/prompt-schemas';
import { buildBasicJsonSchema, type BasicResult } from '../prompts/schema';

/*
 * Basic evaluator that accepts a simple text prompt.
 * It wraps the user's prompt with system instructions to ensure structured output.
 */
export class BasicEvaluator extends BaseEvaluator {
    private llmProvider: LLMProvider;
    private prompt: PromptFile;

    constructor(llmProvider: LLMProvider, prompt: PromptFile) {
        super();
        this.llmProvider = llmProvider;
        this.prompt = prompt;
    }

    async evaluate(_file: string, content: string): Promise<BasicResult> {
        const schema = buildBasicJsonSchema();

        // Build criteria list if defined
        const hasCriteria = this.prompt.meta.criteria && this.prompt.meta.criteria.length > 0;
        let criteriaList = '';
        if (hasCriteria) {
            criteriaList = '\n\nYou should evaluate the content based on these specific criteria:\n';
            for (const c of this.prompt.meta.criteria!) {
                criteriaList += `- ${c.name} (id: ${c.id})\n`;
            }
            criteriaList += '\nWhen reporting violations, include the "criterionName" field with the name of the criterion that was violated.';
        }

        // We construct a system prompt that includes the user's simple instruction
        // but enforces the structured output format required by the system.
        const systemInstruction = `
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

        const result = await this.llmProvider.runPromptStructured<BasicResult>(
            content,
            systemInstruction,
            schema
        );
        return result;
    }
}

// Self-register on module load
BasicEvaluator.register('basic', (llmProvider, prompt) => {
    return new BasicEvaluator(llmProvider, prompt);
});
