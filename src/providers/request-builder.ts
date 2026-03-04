// Centralized request construction for provider-agnostic use

export interface EvalContext {
  fileType?: string;
}

export interface RequestBuilder {
  buildPromptBodyForStructured(originalBody: string, context?: EvalContext): string;
}

export class DefaultRequestBuilder implements RequestBuilder {
  private directive: string;
  private userInstructions: string;

  constructor(directive?: string, userInstructions?: string) {
    this.directive = (directive || '').trim();
    this.userInstructions = (userInstructions || '').trim();
  }

  buildPromptBodyForStructured(originalBody: string, context?: EvalContext): string {
    let directive = this.directive;
    if (directive) {
      directive = directive.replace('{{file_type}}', context?.fileType ?? '');
    }
    const directiveSection = directive ? `${directive}\n\n` : '';
    const userInstructionsSection = this.userInstructions ? `${this.userInstructions}\n\n` : '';
    return directiveSection + userInstructionsSection + originalBody;
  }
}
