import { describe, expect, it } from 'vitest';
import * as findings from '../../src/findings';

describe('src/findings public surface', () => {
  it('exports the processing entry point and helpers', () => {
    expect(typeof findings.processFindings).toBe('function');
    expect(typeof findings.verifyFindingEvidence).toBe('function');
    expect(typeof findings.resolveSeverity).toBe('function');
    expect(typeof findings.buildRuleId).toBe('function');
    expect(typeof findings.resolveCriterionId).toBe('function');
    expect(typeof findings.scoreCheck).toBe('function');
  });

  it('exports the stable diagnostic code constant', () => {
    expect(findings.FINDING_EVIDENCE_NOT_LOCATABLE).toBe(
      'finding-evidence-not-locatable',
    );
  });

  it('exports the Zod boundary schemas', () => {
    expect(findings.FINDING_PROCESSING_INPUT_SCHEMA).toBeDefined();
    expect(findings.RAW_VIOLATION_SCHEMA).toBeDefined();
    expect(findings.GATE_CHECKS_SCHEMA).toBeDefined();
    expect(findings.FINDINGS_CRITERION_SCHEMA).toBeDefined();
    expect(findings.PROMPT_META_FOR_FINDINGS_SCHEMA).toBeDefined();
  });
});
