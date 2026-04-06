import Tokenizer from 'ai-tokenizer';
import * as claudeEncoding from 'ai-tokenizer/encoding/claude';
import * as o200kEncoding from 'ai-tokenizer/encoding/o200k_base';

export type { Tokenizer };

// Minimal interface satisfied by Tokenizer — accept any compatible counter in tests.
export interface TokenCounter {
  count(text: string): number;
}

function resolveEncoding() {
  switch (process.env.LLM_PROVIDER) {
    case 'anthropic':
    case 'amazon-bedrock':
      return claudeEncoding;
    case 'openai':
    case 'azure-openai':
    case 'gemini':
      return o200kEncoding;
    default:
      throw new Error(`[vectorlint] Cannot resolve tokenizer: unknown LLM_PROVIDER "${process.env.LLM_PROVIDER}"`);
  }
}

export function resolveTokenizer(): Tokenizer {
  return new Tokenizer(resolveEncoding());
}

export function estimateTokens(text: string, counter: TokenCounter): number {
  return counter.count(text ?? '');
}
