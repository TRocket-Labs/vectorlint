import { describe, it, expect } from 'vitest';
import {
  verifyFindingEvidence,
  FINDING_EVIDENCE_NOT_LOCATABLE,
} from '../../src/findings/finding-evidence-verifier';

const CONTENT = 'line one\nline two has the quote\nline three';

describe('verifyFindingEvidence', () => {
  it('locates an exact quote and returns a verified finding', () => {
    const result = verifyFindingEvidence(CONTENT, {
      quoted_text: 'the quote',
      context_before: '',
      context_after: '',
      line: 2,
    });
    expect(result.verified).toBe(true);
    expect(result.finding?.line).toBe(2);
    expect(result.finding?.match).toBe('the quote');
    expect(result.diagnostic).toBeUndefined();
  });

  it('returns a warn diagnostic (not a fallback finding) when evidence cannot be located', () => {
    const result = verifyFindingEvidence(CONTENT, {
      quoted_text: 'this does not exist anywhere',
      context_before: '',
      context_after: '',
      line: 99,
    });
    expect(result.verified).toBe(false);
    expect(result.finding).toBeUndefined();
    expect(result.diagnostic?.code).toBe(FINDING_EVIDENCE_NOT_LOCATABLE);
    expect(result.diagnostic?.level).toBe('warn');
  });

  it('never returns a finding whose line came from the model when the quote did not anchor', () => {
    // The unreleased internal agent implementation fell back to the
    // model-provided line (here 1) and surfaced the raw quoted_text as a
    // verified match. Assert we do not.
    // (Use a lexically distant quote that locateQuotedText cannot anchor.)
    const result = verifyFindingEvidence(CONTENT, {
      quoted_text: 'definitely not present xyzzy',
      context_before: '',
      context_after: '',
      line: 1,
    });
    expect(result.verified).toBe(false);
    expect(result.finding).toBeUndefined();
  });

  it('still anchors a quote when no line hint is provided', () => {
    const result = verifyFindingEvidence(CONTENT, {
      quoted_text: 'line three',
    });
    expect(result.verified).toBe(true);
    expect(result.finding?.line).toBe(3);
    expect(result.finding?.column).toBe(1);
  });

  it('produces a diagnostic that mentions the (truncated) quoted text', () => {
    const longQuote = 'x'.repeat(120);
    const result = verifyFindingEvidence(CONTENT, {
      quoted_text: longQuote,
    });
    expect(result.verified).toBe(false);
    expect(result.diagnostic?.message).toContain('x'.repeat(60));
    // Truncated, not the full 120 chars.
    expect(result.diagnostic?.message).not.toContain('x'.repeat(61));
  });
});
