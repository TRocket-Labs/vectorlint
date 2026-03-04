import { describe, it, expect } from 'vitest';
import { DefaultRequestBuilder } from '../src/providers/request-builder.js';

describe('RequestBuilder', () => {
  it('prepends directive to structured prompts without extra builder text', () => {
    const b = new DefaultRequestBuilder('DIR');
    const out = b.buildPromptBodyForStructured('P');
    expect(out).toBe('DIR\n\nP');
  });

  it('replaces {{file_type}} with the extension when provided', () => {
    const b = new DefaultRequestBuilder('type={{file_type}}');
    const out = b.buildPromptBodyForStructured('P', { fileType: '.mdx' });
    expect(out).toBe('type=.mdx\n\nP');
  });

  it('replaces {{file_type}} with empty string when context is absent', () => {
    const b = new DefaultRequestBuilder('type={{file_type}}');
    const out = b.buildPromptBodyForStructured('P');
    expect(out).not.toContain('{{file_type}}');
    expect(out).toBe('type=\n\nP');
  });

  it('replaces {{file_type}} with empty string when fileType is undefined', () => {
    const b = new DefaultRequestBuilder('type={{file_type}}');
    const out = b.buildPromptBodyForStructured('P', {});
    expect(out).not.toContain('{{file_type}}');
  });
});
