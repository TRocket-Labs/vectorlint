import { BaseEvaluator } from "./evaluator";
import type { LLMProvider } from "../providers/llm-provider";
import type { SearchProvider } from "../providers/search-provider";
import type { PromptFile } from "../schemas/prompt-schemas";
import {
  buildCriteriaJsonSchema,
  type CriteriaResult,
} from "../prompts/schema";
import { renderTemplate } from "../prompts/template-renderer";
import { loadPrompts } from "../prompts/prompt-loader";
import { z } from "zod";
import path from "path";

// Schema for claim extraction response
const CLAIM_EXTRACTION_SCHEMA = z.object({
  claims: z.array(z.string()),
});

type ClaimExtractionResult = z.infer<typeof CLAIM_EXTRACTION_SCHEMA>;

// Schema for search result
const SEARCH_RESULT_SCHEMA = z.object({
  snippet: z.string(),
  url: z.string(),
  title: z.string().optional(),
});

type SearchResult = z.infer<typeof SEARCH_RESULT_SCHEMA>;

/**
 * Technical Accuracy Evaluator - Acts as an orchestrator only.
 *
 * Philosophy:
 * - Evaluator (this class): Orchestrates data gathering (claims, search evidence)
 * - Eval (prompt): Contains all evaluation logic via templates
 *
 * Architecture:
 * 1. Extract claims from content (via LLM with claim-extraction prompt)
 * 2. Search for evidence for each claim (via SearchProvider)
 * 3. Pass content, claims, and evidence to the main eval prompt (via templates)
 * 4. Return the structured evaluation result
 *
 * This evaluator does NOT contain evaluation logic - all evaluation is done by the prompt.
 */
export class TechnicalAccuracyEvaluator extends BaseEvaluator {
  private claimExtractionPrompt: PromptFile | null = null;

  constructor(
    private llmProvider: LLMProvider,
    private prompt: PromptFile,
    private searchProvider: SearchProvider
  ) {
    super();
    this.loadClaimExtractionPrompt();
  }

  /**
   * Load the claim extraction prompt from the prompts directory.
   * This is called during construction to ensure the prompt is available.
   */
  private loadClaimExtractionPrompt(): void {
    try {
      // Determine prompts directory from the main prompt's path
      const promptsDir = path.dirname(this.prompt.fullPath);

      // Load all prompts and find claim-extraction
      const { prompts } = loadPrompts(promptsDir, { verbose: false });
      const claimPrompt = prompts.find(
        (p) =>
          p.id === "claim-extraction" || p.filename === "claim-extraction.md"
      );

      if (!claimPrompt) {
        console.warn(
          `[vectorlint] Claim extraction prompt not found in ${promptsDir}. Technical accuracy evaluator may not work correctly.`
        );
        return;
      }

      this.claimExtractionPrompt = claimPrompt;
    } catch (e: unknown) {
      const err = e instanceof Error ? e : new Error(String(e));
      console.warn(
        `[vectorlint] Failed to load claim extraction prompt: ${err.message}`
      );
    }
  }

  async evaluate(_file: string, content: string): Promise<CriteriaResult> {
    //  Step 1: Extract factual claims from the content
    const claims = await this.extractClaims(content);

    // If no claims found, return success (empty criteria array)
    if (claims.length === 0) {
      return {
        criteria: [],
      };
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

    // Step 5: Run the evaluation prompt
    const schema = buildCriteriaJsonSchema();
    const result = await this.llmProvider.runPromptStructured<CriteriaResult>(
      content,
      renderedPrompt,
      schema
    );

    return result;
  }

  /**
   * Extract factual claims from content using the claim extraction prompt.
   */
  private async extractClaims(content: string): Promise<string[]> {
    // If claim extraction prompt is not available, skip extraction
    if (!this.claimExtractionPrompt) {
      console.warn(
        "[vectorlint] Claim extraction prompt not available, skipping claim extraction"
      );
      return [];
    }

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

      const claimResult =
        await this.llmProvider.runPromptStructured<ClaimExtractionResult>(
          content,
          this.getClaimExtractionPromptBody(),
          claimSchema
        );

      return claimResult.claims;
    } catch (e: unknown) {
      const err = e instanceof Error ? e : new Error(String(e));
      console.warn(`[vectorlint] Claim extraction failed: ${err.message}`);
      return [];
    }
  }

  /**
   * Get the claim extraction prompt body, ensuring it's defined.
   * Throws an error if the prompt is missing or has no body.
   */
  private getClaimExtractionPromptBody(): string {
    if (!this.claimExtractionPrompt || !this.claimExtractionPrompt.body) {
      throw new Error("Claim extraction prompt body is unavailable");
    }
    return this.claimExtractionPrompt.body;
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

// Self-register on module load
TechnicalAccuracyEvaluator.register(
  "technical-accuracy",
  (llmProvider, prompt, searchProvider) => {
    if (!searchProvider) {
      throw new Error(
        "technical-accuracy evaluator requires a search provider"
      );
    }
    return new TechnicalAccuracyEvaluator(llmProvider, prompt, searchProvider);
  }
);
