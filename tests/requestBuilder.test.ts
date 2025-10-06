import { describe, it, expect } from 'vitest';
import { DefaultRequestBuilder } from '../src/providers/RequestBuilder.js';

describe('RequestBuilder', () => {
  it('appends directive to structured prompts without extra builder text', () => {
    const b = new DefaultRequestBuilder('DIR');
    const out = b.buildPromptBodyForStructured('P');
    expect(out).toBe('P\n\nDIR');
  });
});
