import type { AgentFinding, AgentRunResult } from './types.js';

export function collectAgentFindings(agentResults: AgentRunResult[]): AgentFinding[] {
  return agentResults.flatMap((result) => result.findings);
}
