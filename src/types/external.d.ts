declare module '@perplexity-ai/perplexity_ai' {
  export default class Perplexity {
    constructor();
    search: {
      create(params: {
        query: string;
        max_results?: number;
        max_tokens_per_page?: number;
      }): Promise<unknown>;
    };
  }
}
