import { describe, it, expect } from 'vitest';
import { composeSystemPrompt } from '../src/prompts/system-prompt.js';

describe('composeSystemPrompt', () => {
  it('prepends directive to instructions', () => {
    const out = composeSystemPrompt({
      directive: 'DIR',
      instructions: 'P',
    });
    expect(out).toBe('DIR\n\nP');
  });

  it('includes user instructions between directive and instructions', () => {
    const out = composeSystemPrompt({
      directive: 'DIR',
      userInstructions: 'USER',
      instructions: 'P',
    });
    expect(out).toBe('DIR\n\nUSER\n\nP');
  });

  it('drops empty sections', () => {
    const out = composeSystemPrompt({
      directive: '  ',
      userInstructions: '',
      instructions: 'P',
    });
    expect(out).toBe('P');
  });
});
