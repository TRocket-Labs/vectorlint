import { buildRuleId, normalizeRuleSource } from './rule-id';
import { SESSION_EVENT_TYPE, type SessionEvent } from './types';
import { Severity } from '../evaluators/types';
import { computeFilterDecision } from '../evaluators/violation-filter';
import { locateQuotedText } from '../output/location';
import type { PromptFile } from '../prompts/prompt-loader';

export type FindingLikeViolation = {
  line?: number;
  quoted_text?: string;
  context_before?: string;
  context_after?: string;
  description?: string;
  analysis?: string;
  message?: string;
  suggestion?: string;
  fix?: string;
  confidence?: number;
  checks?: {
    plausible_non_violation?: boolean;
    context_supports_violation?: boolean;
    rule_supports_claim?: boolean;
  };
};

export type AgentFindingRecord = {
  file: string;
  line: number;
  column: number;
  severity: Severity;
  message: string;
  ruleId: string;
  ruleSource: string;
  analysis?: string;
  suggestion?: string;
  fix?: string;
  match?: string;
};

type InlineFindingEventPayload = {
  file: string;
  line: number;
  column: number;
  severity: Severity;
  ruleId: string;
  ruleSource: string;
  message: string;
  analysis?: string;
  suggestion?: string;
  fix?: string;
  match?: string;
};

type ReviewSessionStoreLike = {
  append(entry: {
    eventType: typeof SESSION_EVENT_TYPE.FindingRecordedInline;
    payload: InlineFindingEventPayload;
  }): Promise<void>;
};

export function fallbackMessage(reasoning?: string): string {
  if (reasoning) {
    return reasoning;
  }
  return 'Potential issue detected';
}

export function severityFromPrompt(prompt: PromptFile): Severity {
  return prompt.meta.severity === Severity.ERROR ? Severity.ERROR : Severity.WARNING;
}

export async function appendInlineFinding(params: {
  violation: FindingLikeViolation;
  reasoning?: string;
  content: string;
  relFile: string;
  prompt: PromptFile;
  ruleSource: string;
  store: ReviewSessionStoreLike;
}): Promise<boolean> {
  const { violation, reasoning, content, relFile, prompt, ruleSource, store } = params;
  const filterDecision = computeFilterDecision(violation);
  if (!filterDecision.surface) {
    return false;
  }

  const location = locateQuotedText(
    content,
    {
      quoted_text: violation.quoted_text || '',
      context_before: violation.context_before || '',
      context_after: violation.context_after || '',
    },
    80,
    violation.line
  );

  const line = location?.line ?? Math.max(1, Math.trunc(violation.line ?? 1));
  const column = location?.column ?? 1;
  const match = location?.match ?? violation.quoted_text ?? '';
  const message = (violation.message || violation.description || fallbackMessage(reasoning)).trim();

  const finding: AgentFindingRecord = {
    file: relFile,
    line,
    column,
    severity: severityFromPrompt(prompt),
    message,
    ruleId: buildRuleId(prompt),
    ruleSource: normalizeRuleSource(ruleSource),
    ...(violation.analysis ? { analysis: violation.analysis } : {}),
    ...(violation.suggestion ? { suggestion: violation.suggestion } : {}),
    ...(violation.fix ? { fix: violation.fix } : {}),
    ...(match ? { match } : {}),
  };

  await store.append({
    eventType: SESSION_EVENT_TYPE.FindingRecordedInline,
    payload: {
      file: finding.file,
      line: finding.line,
      column: finding.column,
      severity: finding.severity,
      ruleId: finding.ruleId,
      ruleSource: finding.ruleSource,
      message: finding.message,
      ...(finding.analysis ? { analysis: finding.analysis } : {}),
      ...(finding.suggestion ? { suggestion: finding.suggestion } : {}),
      ...(finding.fix ? { fix: finding.fix } : {}),
      ...(finding.match ? { match: finding.match } : {}),
    },
  });

  return true;
}

export function findingsFromEvents(events: SessionEvent[]): AgentFindingRecord[] {
  const findings: AgentFindingRecord[] = [];

  for (const event of events) {
    if (
      event.eventType !== SESSION_EVENT_TYPE.FindingRecordedInline &&
      event.eventType !== SESSION_EVENT_TYPE.FindingRecordedTopLevel
    ) {
      continue;
    }

    const payload = event.payload;
    const file = payload.file ?? '.';
    const line = payload.line ?? 1;
    findings.push({
      file,
      line,
      column: payload.column ?? 1,
      severity: payload.severity === Severity.ERROR ? Severity.ERROR : Severity.WARNING,
      message: payload.message,
      ruleId: payload.ruleId ?? payload.ruleSource,
      ruleSource: payload.ruleSource,
      ...('analysis' in payload && payload.analysis ? { analysis: payload.analysis } : {}),
      ...('suggestion' in payload && payload.suggestion ? { suggestion: payload.suggestion } : {}),
      ...('fix' in payload && payload.fix ? { fix: payload.fix } : {}),
      ...('match' in payload && payload.match ? { match: payload.match } : {}),
    });
  }

  return findings;
}
