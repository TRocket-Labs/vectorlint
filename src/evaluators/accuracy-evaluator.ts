import { BaseEvaluator } from "./base-evaluator";
import { registerEvaluator } from "./evaluator-registry";
import type { LLMProvider } from "../providers/llm-provider";
import type { SearchProvider } from "../providers/search-provider";
import type { PromptFile } from "../schemas/prompt-schemas";
import type { EvaluationResult } from "../prompts/schema";
import { renderTemplate } from "../prompts/template-renderer";
import { getPrompt } from "./prompt-loader";
import { z } from "zod";
import { Type, type Severity } from "./types";

// Schema for claim extraction response
const CLAIM_EXTRACTION_SCHEMA = z.object({
  claims: z.array(z.string()),
});

// Schema for search result
const SEARCH_RESULT_SCHEMA = z.object({
  snippet: z.string(),
  url: z.string(),
  title: z.string().optional(),
});

type SearchResult = z.infer<typeof SEARCH_RESULT_SCHEMA>;

/**
 * Technical Accuracy Evaluator - Acts as an orchestrator only.
 * - Evaluator (this class): Orchestrates data gathering (claims, search evidence)
 * - Eval (prompt): Contains all evaluation logic via templates
 *
 * Architecture:
 * 1. Extract claims from content (via LLM with claim-extraction prompt)
 * 2. Search for evidence for each claim (via SearchProvider)
 * 3. Pass content, claims, and evidence to the main eval prompt (via templates)
 * 4. Return the structured evaluation result
 *
 * Evaluators should NOT contain evaluation logic - all evaluation is done by the prompt.
 */
export class TechnicalAccuracyEvaluator extends BaseEvaluator {
  private static readonly CLAIM_EXTRACTION_PROMPT_KEY = "claim-extraction";

  constructor(
    llmProvider: LLMProvider,
    prompt: PromptFile,
    private searchProvider: SearchProvider,
    defaultSeverity?: Severity
  ) {
    super(llmProvider, prompt, defaultSeverity);
  }

  async evaluate(_file: string, content: string): Promise<EvaluationResult> {
    // Step 1: Extract factual claims from the content
    const claims = await this.extractClaims(content);

    // If no claims found, return success (empty items array, perfect score)
    // We delegate to the base evaluator's centralized scoring logic
    if (claims.length === 0) {
      const wordCount = content.trim().split(/\s+/).length || 1;
      return this.calculateSemiObjectiveResult([], wordCount);
    }

    // Step 2: Search for evidence for each claim
    const searchResults = await this.searchForEvidence(claims);

    // Step 3: Prepare template variables
    const templateVars = {
      content: content,
      claims: this.formatClaimsForTemplate(claims),
      searchResults: this.formatSearchResultsForTemplate(searchResults),
    };

    // Step 4: Render the prompt with template variables
    const renderedPrompt = renderTemplate(this.getPromptBody(), templateVars);

    // Step 5: Create enriched prompt with rendered body
    // We do NOT override the type here; we respect the prompt's configuration
    const enrichedPrompt: PromptFile = {
      ...this.prompt,
      body: renderedPrompt,
    };

    // Step 6: Use parent's evaluation logic with enriched prompt
    const evaluator = new BaseEvaluator(this.llmProvider, enrichedPrompt, this.defaultSeverity);
    return evaluator.evaluate(_file, content);
  }

  /**
   * Extract factual claims from content using the claim extraction prompt.
   */
  private async extractClaims(content: string): Promise<string[]> {
    try {
      const claimSchema = {
        name: "ClaimExtraction",
        schema: {
          type: "object",
          properties: {
            claims: {
              type: "array",
              items: { type: "string" },
            },
          },
          required: ["claims"],
        },
      };

      const claimExtractionPrompt = getPrompt(
        TechnicalAccuracyEvaluator.CLAIM_EXTRACTION_PROMPT_KEY
      );

      const claimResultRaw =
        await this.llmProvider.runPromptStructured<unknown>(
          content,
          claimExtractionPrompt,
          claimSchema
        );

      // Validate the response with Zod schema
      const claimResult = CLAIM_EXTRACTION_SCHEMA.parse(claimResultRaw);

      return claimResult.claims;
    } catch (e: unknown) {
      const err = e instanceof Error ? e : new Error(String(e));
      console.warn(`[vectorlint] Claim extraction failed: ${err.message}`);
      return [];
    }
  }

  /**
   * Search for evidence for each claim.
   * Returns a map of claim index to search results.
   */
  private async searchForEvidence(
    claims: string[]
  ): Promise<Map<number, SearchResult[]>> {
    const resultsMap = new Map<number, SearchResult[]>();

    for (let i = 0; i < claims.length; i++) {
      const claim = claims[i];
      // Skip if claim is undefined (shouldn't happen, but TypeScript requires the check)
      if (!claim) {
        resultsMap.set(i, []);
        continue;
      }

      try {
        const snippetsRaw: unknown = await this.searchProvider.search(claim);

        // Validate search results
        const SEARCH_RESULTS_ARRAY_SCHEMA = z.array(SEARCH_RESULT_SCHEMA);
        const snippets = SEARCH_RESULTS_ARRAY_SCHEMA.parse(snippetsRaw);

        resultsMap.set(i, snippets);
      } catch (e: unknown) {
        const err = e instanceof Error ? e : new Error(String(e));
        console.warn(
          `[vectorlint] Search failed for claim "${claim}": ${err.message}`
        );
        resultsMap.set(i, []);
      }
    }

    return resultsMap;
  }

  /**
   * Format claims as a numbered list for the template.
   */
  private formatClaimsForTemplate(claims: string[]): string {
    return claims.map((claim, index) => `${index + 1}. ${claim}`).join("\n");
  }

  /**
   * Format search results grouped by claim for the template.
   */
  private formatSearchResultsForTemplate(
    resultsMap: Map<number, SearchResult[]>
  ): string {
    const formatted: string[] = [];

    for (const [index, results] of resultsMap.entries()) {
      const claimNum = index + 1;
      formatted.push(`\n### Claim ${claimNum} Evidence:`);

      if (results.length === 0) {
        formatted.push("No search results found.");
      } else {
        results.forEach((result, i) => {
          formatted.push(`[${i + 1}] ${result.snippet} (${result.url})`);
        });
      }
    }

    return formatted.join("\n");
  }

  /**
   * Get the prompt body, ensuring it's defined.
   * Throws an error if the prompt body is missing.
   */
  private getPromptBody(): string {
    if (!this.prompt.body) {
      throw new Error("Prompt body is empty or undefined");
    }
    return this.prompt.body;
  }
}

// Self-register on module load using registerEvaluator directly
registerEvaluator(Type.TECHNICAL_ACCURACY, (llmProvider, prompt, searchProvider, defaultSeverity) => {
  if (!searchProvider) {
    throw new Error("technical-accuracy evaluator requires a search provider");
  }
  return new TechnicalAccuracyEvaluator(llmProvider, prompt, searchProvider, defaultSeverity);
});
