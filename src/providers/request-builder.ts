// Centralized request construction for provider-agnostic use

export interface RequestBuilder {
  buildPromptBodyForStructured(originalBody: string): string;
}

export class DefaultRequestBuilder implements RequestBuilder {
  private directive: string;
  private styleGuide: string;

  constructor(directive?: string, styleGuide?: string) {
    this.directive = (directive || '').trim();
    this.styleGuide = (styleGuide || '').trim();
  }

  buildPromptBodyForStructured(originalBody: string): string {
    // Prepend the style guide with a simple newline separation
    const styleGuideSection = this.styleGuide
      ? `${this.styleGuide}\n\n`
      : '';
    const directive = this.directive ? `\n\n${this.directive}` : '';
    return styleGuideSection + originalBody + directive;
  }
}
