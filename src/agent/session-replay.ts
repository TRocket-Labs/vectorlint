import { readFile } from "fs/promises";
import { mergeAgentFindings } from "./merger";
import { SessionEventSchema, type AgentFinding, type SessionEvent } from "./types";

export interface AgentReplayReport {
  summary: {
    errors: number;
    warnings: number;
    totalFindings: number;
  };
  findings: AgentFinding[];
  scores: Array<{
    ruleId: string;
    score: number;
  }>;
}

export async function replaySessionEvents(sessionFilePath: string): Promise<SessionEvent[]> {
  const contents = await readFile(sessionFilePath, "utf-8");
  const lines = contents.split(/\r?\n/).filter(Boolean);
  return lines.map((line) => SessionEventSchema.parse(JSON.parse(line)));
}

export async function replaySessionFindings(sessionFilePath: string): Promise<AgentFinding[]> {
  const events = await replaySessionEvents(sessionFilePath);
  let findings: AgentFinding[] = [];

  for (const event of events) {
    if (
      event.eventType === "finding_recorded_inline" ||
      event.eventType === "finding_recorded_top_level"
    ) {
      findings = mergeAgentFindings(findings, [event.payload.finding]);
    }
  }

  return findings;
}

export async function buildAgentReplayReport(
  sessionFilePath: string
): Promise<AgentReplayReport> {
  const findings = await replaySessionFindings(sessionFilePath);
  const findingsByRule = new Map<string, number>();

  for (const finding of findings) {
    findingsByRule.set(
      finding.ruleId,
      (findingsByRule.get(finding.ruleId) ?? 0) + 1
    );
  }

  const scores = [...findingsByRule.entries()].map(([ruleId, count]) => ({
    ruleId,
    score: Math.max(0, 10 - count * 2),
  }));

  return {
    summary: {
      errors: findings.length,
      warnings: 0,
      totalFindings: findings.length,
    },
    findings,
    scores,
  };
}
