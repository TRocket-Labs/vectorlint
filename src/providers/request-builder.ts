// Centralized request construction for provider-agnostic use

export interface RequestBuilder {
  buildPromptBodyForStructured(originalBody: string): string;
}

export class DefaultRequestBuilder implements RequestBuilder {
  private directive: string;
  private userInstructions: string;

  constructor(directive?: string, userInstructions?: string) {
    this.directive = (directive || '').trim();
    this.userInstructions = (userInstructions || '').trim();
  }

  buildPromptBodyForStructured(originalBody: string): string {
    const directiveSection = this.directive ? `${this.directive}\n\n` : '';
    const userInstructionsSection = this.userInstructions ? `${this.userInstructions}\n\n` : '';
    return directiveSection + userInstructionsSection + originalBody;
  }
}
