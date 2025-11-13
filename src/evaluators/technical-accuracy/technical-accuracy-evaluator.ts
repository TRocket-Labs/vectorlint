import type { Evaluator } from '../evaluator';
import type { LLMProvider } from '../../providers/llm-provider';
import type { SearchProvider, SearchResult } from '../../providers/search-provider';
import type { PromptFile } from '../../schemas/prompt-schemas';
import type { CriteriaResult } from '../../prompts/schema';
import type { Claim, SearchQuery } from './types';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

/**
 * TechnicalAccuracyEvaluator orchestrates the technical accuracy pipeline.
 * 
 * Pipeline: Extract Claims → Generate Queries → Search → Evaluate Accuracy
 */
export class TechnicalAccuracyEvaluator implements Evaluator {
  private llmProvider: LLMProvider;
  private searchProvider: SearchProvider;
  private evaluationPrompt: PromptFile;
  private internalPrompts: { extractClaims: string; generateQueries: string };

  constructor(
    llmProvider: LLMProvider,
    searchProvider: SearchProvider,
    evaluationPrompt: PromptFile
  ) {
    this.llmProvider = llmProvider;
    this.searchProvider = searchProvider;
    this.evaluationPrompt = evaluationPrompt;

    // Load internal prompts from JSON file (ESM-compatible)
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const promptsPath = resolve(__dirname, 'prompts.json');
    const promptsJson = readFileSync(promptsPath, 'utf-8');
    this.internalPrompts = JSON.parse(promptsJson);
  }

  /**
   * Evaluate content for technical accuracy using search verification
   */
  async evaluate(file: string, content: string): Promise<CriteriaResult> {
    // Step 1: Extract claims from content
    const claims = await this.extractClaims(content);

    // Step 2: If no claims found, return perfect score
    if (claims.length === 0) {
      return this.createEmptyResult();
    }

    // Step 3: Generate search queries for claims
    const queries = await this.generateQueries(claims);

    // Step 4: Search for verification data
    const searchResults = await this.searchClaims(queries);

    // Step 5: Evaluate accuracy using search context
    const result = await this.evaluateAccuracy(content, claims, searchResults);

    return result;
  }

  /**
   * Extract factual claims from content using LLM
   */
  private async extractClaims(content: string): Promise<Claim[]> {
    // Load prompt template and replace placeholder
    const promptText = this.internalPrompts.extractClaims.replace('{content}', content);

    // Define schema for structured output
    const schema = {
      name: 'claims_extraction',
      schema: {
        type: 'object',
        properties: {
          claims: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                text: { type: 'string' },
                line: { type: 'number' },
                type: { type: 'string', enum: ['factual', 'statistical', 'technical'] },
              },
              required: ['text', 'line', 'type'],
            },
          },
        },
        required: ['claims'],
      },
    };

    // Call LLM with structured output
    const result = await this.llmProvider.runPromptStructured<{ claims: Claim[] }>(
      '',
      promptText,
      schema
    );

    return result.claims || [];
  }

  /**
   * Generate optimized search queries for claims
   */
  private async generateQueries(claims: Claim[]): Promise<SearchQuery[]> {
    // Format claims as numbered list
    const claimsList = claims
      .map((c, i) => `${i + 1}. ${c.text} (Line ${c.line}, Type: ${c.type})`)
      .join('\n');

    // Load prompt template and replace placeholder
    const promptText = this.internalPrompts.generateQueries.replace('{claims}', claimsList);

    // Define schema for structured output
    const schema = {
      name: 'query_generation',
      schema: {
        type: 'object',
        properties: {
          queries: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                claim: { type: 'string' },
                query: { type: 'string' },
              },
              required: ['claim', 'query'],
            },
          },
        },
        required: ['queries'],
      },
    };

    // Call LLM with structured output
    const result = await this.llmProvider.runPromptStructured<{ queries: SearchQuery[] }>(
      '',
      promptText,
      schema
    );

    return result.queries || [];
  }

  /**
   * Search for verification data for each claim
   */
  private async searchClaims(queries: SearchQuery[]): Promise<Map<string, SearchResult>> {
    const results = new Map<string, SearchResult>();

    for (const query of queries) {
      try {
        const searchResult = await this.searchProvider.search(query.query);
        results.set(query.claim, searchResult);
      } catch (error) {
        // Log warning but continue with other claims
        console.warn(`[vectorlint] Search failed for claim "${query.claim}": ${error}`);
        
        // Store empty result
        results.set(query.claim, {
          query: query.query,
          sources: [],
          summary: 'Search failed',
        });
      }
    }

    return results;
  }

  /**
   * Evaluate accuracy using search context
   */
  private async evaluateAccuracy(
    content: string,
    claims: Claim[],
    searchResults: Map<string, SearchResult>
  ): Promise<CriteriaResult> {
    // Build verification context from search results
    const verificationContext = this.buildVerificationContext(claims, searchResults);

    // Append context to evaluation prompt
    const fullPrompt = `${this.evaluationPrompt.body}\n\n## VERIFICATION CONTEXT\n\n${verificationContext}\n\n## CONTENT TO VERIFY\n\n${content}`;

    // Build schema for criteria result
    const schema = {
      name: 'technical_accuracy_result',
      strict: true,
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          criteria: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                name: { type: 'string' },
                weight: { type: 'number' },
                score: { type: 'number', enum: [0, 1, 2, 3, 4] },
                summary: { type: 'string' },
                reasoning: { type: 'string' },
                violations: {
                  type: 'array',
                  items: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                      pre: { type: 'string' },
                      post: { type: 'string' },
                      analysis: { type: 'string' },
                      suggestion: { type: 'string' },
                    },
                    required: ['pre', 'post', 'analysis', 'suggestion'],
                  },
                },
              },
              required: ['name', 'weight', 'score', 'summary', 'reasoning', 'violations'],
            },
          },
        },
        required: ['criteria'],
      },
    };

    // Call LLM with full prompt and context
    const result = await this.llmProvider.runPromptStructured<CriteriaResult>(
      '',
      fullPrompt,
      schema
    );

    return result;
  }

  /**
   * Build formatted verification context from search results
   */
  private buildVerificationContext(
    claims: Claim[],
    searchResults: Map<string, SearchResult>
  ): string {
    const sections: string[] = [];

    for (const claim of claims) {
      const searchResult = searchResults.get(claim.text);
      
      if (!searchResult) {
        sections.push(
          `### Claim: "${claim.text}" (Line ${claim.line})\n` +
          `Type: ${claim.type}\n` +
          `Status: No search results available\n`
        );
        continue;
      }

      const findings = searchResult.sources.length > 0
        ? searchResult.sources
            .slice(0, 3) // Limit to top 3 sources
            .map(s => `  - ${s.snippet} (${s.url})`)
            .join('\n')
        : '  - No results found';

      sections.push(
        `### Claim: "${claim.text}" (Line ${claim.line})\n` +
        `Type: ${claim.type}\n` +
        `Search Query: "${searchResult.query}"\n` +
        `Findings:\n${findings}\n` +
        (searchResult.summary ? `Summary: ${searchResult.summary}\n` : '')
      );
    }

    return sections.join('\n---\n\n');
  }

  /**
   * Create empty result when no claims are found
   */
  private createEmptyResult(): CriteriaResult {
    const meta = this.evaluationPrompt.meta;
    
    return {
      criteria: meta.criteria.map(c => ({
        name: String(c.name),
        weight: c.weight,
        score: 4 as const,
        summary: 'No factual claims found to verify',
        reasoning: 'Content does not contain verifiable factual claims',
        violations: [],
      })),
    };
  }
}
