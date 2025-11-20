import { BaseEvaluator } from './evaluator';
import type { LLMProvider } from '../providers/llm-provider';
import type { SearchProvider } from '../providers/search-provider';
import type { PromptFile } from '../schemas/prompt-schemas';
import { buildCriteriaJsonSchema, type CriteriaResult } from '../prompts/schema';
import { VERIFICATION_RESPONSE_SCHEMA, type VerificationResponse } from '../schemas/search-schemas';
import { z } from 'zod';

const MIN_CLAIM_LENGTH = 6;

interface VerificationResult {
  status: string;
  justification: string;
  link: string;
}

/*
 * Technical accuracy evaluator with fact verification.
 * Extends base LLM evaluation by verifying factual claims against web search results.
 * 
 * Flow:
 * 1. Run base LLM evaluation to detect potential issues
 * 2. For each violation with factual claims, search for evidence
 * 3. Use LLM to verify if evidence supports/contradicts the claim
 * 4. Enrich violation analysis with verification results
 */
export class TechnicalAccuracyEvaluator extends BaseEvaluator {
  constructor(
    private llmProvider: LLMProvider,
    private prompt: PromptFile,
    private searchProvider: SearchProvider
  ) {
    super();
  }

  async evaluate(_file: string, content: string): Promise<CriteriaResult> {
    // Step 1: Run base LLM evaluation
    const schema = buildCriteriaJsonSchema();
    const baseResult = await this.llmProvider.runPromptStructured<CriteriaResult>(
      content,
      this.prompt.body,
      schema
    );

    // Step 2: Verify each violation with web search
    const verifiedResult = { ...baseResult };

    for (const criterion of verifiedResult.criteria) {
      for (const violation of criterion.violations) {
        if (!violation.analysis || violation.analysis.trim().length < MIN_CLAIM_LENGTH) {
          continue; // Skip non-factual violations
        }

        const verification = await this.verifyFact(violation.analysis);

        // Enrich violation with verification results
        violation.analysis = this.enrichAnalysis(
          violation.analysis,
          verification
        );
      }
    }

    return verifiedResult;
  }

  private async verifyFact(claim: string): Promise<VerificationResult> {
    try {
      // Extract searchable claim from analysis text
      const searchClaim = claim.match(/Sentence:\s*(.*?)(?:\s*Issue:|$)/s)?.[1]?.trim() ?? claim;

      // Boundary: Search for evidence (external API call)
      const snippetsRaw: unknown = await this.searchProvider.search(searchClaim);

      // Validate search results at boundary
      const SEARCH_RESULT_SCHEMA = z.array(z.object({
        snippet: z.string(),
        url: z.string(),
        title: z.string().optional(),
      }));

      const snippets = SEARCH_RESULT_SCHEMA.parse(snippetsRaw);

      if (snippets.length === 0) {
        return {
          status: 'unverifiable',
          justification: 'No relevant search results found.',
          link: '',
        };
      }

      // Build verification prompt
      const verificationPrompt = this.buildVerificationPrompt(claim, snippets);

      // Boundary: Get LLM verification (external API call)
      const llmRespRaw: unknown = await this.llmProvider.runPromptStructured(
        verificationPrompt,
        '',
        {
          name: 'VerificationSchema',
          schema: {
            type: 'object',
            properties: {
              status: { type: 'string', enum: ['supported', 'unsupported', 'unverifiable'] },
              justification: { type: 'string' },
              link: { type: 'string' },
            },
            required: ['status', 'justification'],
          },
        }
      );

      // Validate LLM response at boundary
      let llmResp: VerificationResponse;
      try {
        if (typeof llmRespRaw === 'string') {
          const parsed: unknown = JSON.parse(llmRespRaw);
          llmResp = VERIFICATION_RESPONSE_SCHEMA.parse(parsed);
        } else {
          llmResp = VERIFICATION_RESPONSE_SCHEMA.parse(llmRespRaw);
        }
      } catch (e: unknown) {
        const err = e instanceof Error ? e : new Error(String(e));
        console.warn('[vectorlint] Failed to validate verification response:', err.message);
        return {
          status: 'unverifiable',
          justification: 'Invalid response from LLM',
          link: '',
        };
      }

      return {
        status: llmResp.status,
        justification: llmResp.justification,
        link: llmResp.link || snippets[0]?.url || '',
      };

    } catch (e: unknown) {
      const err = e instanceof Error ? e : new Error(String(e));
      return {
        status: 'error',
        justification: err.message,
        link: '',
      };
    }
  }

  private buildVerificationPrompt(claim: string, snippets: Array<{ snippet: string; url: string }>): string {
    return `
You are a **fact verification agent** assisting a hallucination detector.

Task:
Check whether the following statement is supported, unsupported, or unverifiable
based on recent web search snippets.

Definitions:
- supported → credible evidence clearly agrees with the statement.
- unsupported → evidence contradicts or disproves the statement.
- unverifiable → no clear evidence either way, or claim is too broad/general.

Statement:
"${claim}"

Search Snippets:
${snippets.map((s, i) => `[${i + 1}] ${s.snippet} (${s.url})`).join('\n')}

Respond ONLY in JSON:
{
  "status": "supported|unsupported|unverifiable",
  "justification": "brief reason (max 25 words)",
  "link": "most relevant supporting or contradicting source if available"
}
`;
  }

  private enrichAnalysis(original: string, verification: VerificationResult): string {
    let enriched = original;
    enriched += ` [${verification.status}]`;
    if (verification.justification) {
      enriched += ` — ${verification.justification}`;
    }
    if (verification.link) {
      enriched += ` (${verification.link})`;
    }
    return enriched;
  }
}

// Self-register on module load
TechnicalAccuracyEvaluator.register('technical-accuracy', (llmProvider, prompt, searchProvider) => {
  if (!searchProvider) {
    throw new Error('technical-accuracy evaluator requires a search provider');
  }
  return new TechnicalAccuracyEvaluator(llmProvider, prompt, searchProvider);
});
