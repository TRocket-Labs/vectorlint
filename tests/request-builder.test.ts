import { describe, it, expect } from 'vitest';
import { DefaultRequestBuilder } from '../src/providers/request-builder.js';

describe('RequestBuilder', () => {
  it('prepends directive to structured prompts without extra builder text', () => {
    const b = new DefaultRequestBuilder('DIR');
    const out = b.buildPromptBodyForStructured('P');
    expect(out).toBe('DIR\n\nP');
  });
});
