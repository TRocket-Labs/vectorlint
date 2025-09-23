// Centralized request construction for provider-agnostic use

export interface RequestBuilder {
  buildPromptBodyForStructured(originalBody: string): string;
}

export class DefaultRequestBuilder implements RequestBuilder {
  buildPromptBodyForStructured(originalBody: string): string {
    const evidenceInstruction = `\n\nAdditional instruction: For each criterion in your JSON, include an evidence object with exact substrings from the input.\n- evidence.quote: exact snippet you are evaluating (word/sentence/paragraph/section).\n- evidence.pre: 10–20 exact characters immediately before the quote, or empty string if none.\n- evidence.post: 10–20 exact characters immediately after the quote, or empty string if none.\nAlso include a succinct suggestion (max 15 words) to fix warnings/errors, using imperative voice (e.g., \"Add an H1 headline\").\nDo not fabricate anchors. If quote occurs multiple times, choose a distinctive snippet.`;
    return originalBody + evidenceInstruction;
  }
}
