// Centralized request construction for provider-agnostic use

export interface RequestBuilder {
  buildPromptBodyForStructured(originalBody: string): string;
}

export class DefaultRequestBuilder implements RequestBuilder {
  private directive: string;

  constructor(directive?: string) {
    this.directive = (directive || '').trim();
  }

  buildPromptBodyForStructured(originalBody: string): string {
    const directive = this.directive ? `\n\n${this.directive}` : '';
    // Append only the directive text (which includes evidence requirements).
    return originalBody + directive;
  }
}
