// Centralized request construction for provider-agnostic use

export interface ReviewCallContext {
  fileType?: string;
  recordPayloadTelemetry?: boolean;
}

export interface RequestBuilder {
  buildPromptBodyForStructured(originalBody: string, context?: ReviewCallContext): string;
}

export class DefaultRequestBuilder implements RequestBuilder {
  private directive: string;
  private userInstructions: string;

  constructor(directive?: string, userInstructions?: string) {
    this.directive = (directive || '').trim();
    this.userInstructions = (userInstructions || '').trim();
  }

  buildPromptBodyForStructured(originalBody: string, context?: ReviewCallContext): string {
    let directive = this.directive;
    if (directive) {
      directive = directive.replaceAll('{{file_type}}', context?.fileType ?? '');
    }
    const directiveSection = directive ? `${directive}\n\n` : '';
    const userInstructionsSection = this.userInstructions ? `${this.userInstructions}\n\n` : '';
    return directiveSection + userInstructionsSection + originalBody;
  }
}
