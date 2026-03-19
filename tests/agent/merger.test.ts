import { describe, it, expect } from 'vitest';
import { collectAgentFindings } from '../../src/agent/merger';
import type { AgentRunResult } from '../../src/agent/types';

describe('collectAgentFindings', () => {
  it('flattens findings from a single agent result', () => {
    const agentResult: AgentRunResult = {
      ruleId: 'LlmsTxt',
      findings: [
        { kind: 'top-level', message: 'llms.txt is missing', ruleId: 'LlmsTxt' },
      ],
    };

    const findings = collectAgentFindings([agentResult]);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toBe('llms.txt is missing');
  });

  it('flattens findings from multiple agent results', () => {
    const results: AgentRunResult[] = [
      {
        ruleId: 'Coverage',
        findings: [
          { kind: 'top-level', message: 'Missing page for feature X', ruleId: 'Coverage' },
          { kind: 'inline', file: 'docs/a.md', startLine: 5, endLine: 5, message: 'Stale param', ruleId: 'Coverage' },
        ],
      },
      {
        ruleId: 'BrokenLinks',
        findings: [
          { kind: 'inline', file: 'docs/b.md', startLine: 12, endLine: 12, message: 'Broken link', ruleId: 'BrokenLinks' },
        ],
      },
    ];

    const findings = collectAgentFindings(results);
    expect(findings).toHaveLength(3);
  });

  it('returns empty array when no findings', () => {
    const results: AgentRunResult[] = [
      { ruleId: 'Coverage', findings: [] },
      { ruleId: 'BrokenLinks', findings: [] },
    ];
    expect(collectAgentFindings(results)).toHaveLength(0);
  });

  it('returns empty array for empty input', () => {
    expect(collectAgentFindings([])).toHaveLength(0);
  });
});
