import { describe, expect, it } from 'vitest';
import type { LanguageModel } from 'ai';
import { VercelAIProvider } from '../../src/providers/vercel-ai-provider';

describe('LLMProvider agent contract', () => {
  it('supports agent-mode execution via a provider loop interface', () => {
    const provider = new VercelAIProvider({
      model: {} as unknown as LanguageModel,
    });

    const runAgentToolLoop = (provider as { runAgentToolLoop?: unknown }).runAgentToolLoop;
    expect(typeof runAgentToolLoop).toBe('function');
  });
});
