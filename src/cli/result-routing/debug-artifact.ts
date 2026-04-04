import { randomUUID } from 'crypto';
import { computeFilterDecision, type FilterDecision } from '../../evaluators/violation-filter';
import type { JudgeResult, RawCheckResult } from '../../prompts/schema';
import type { PromptFile } from '../../prompts/prompt-loader';
import { writeDebugRunArtifact } from '../../debug/run-artifact';

function getModelInfoFromEnv(): { provider?: string; name?: string; tag?: string } {
  const provider = process.env.LLM_PROVIDER;
  let name: string | undefined;

  switch (provider) {
    case 'openai':
      name = process.env.OPENAI_MODEL;
      break;
    case 'anthropic':
      name = process.env.ANTHROPIC_MODEL;
      break;
    case 'azure-openai':
      name = process.env.AZURE_OPENAI_DEPLOYMENT_NAME;
      break;
    case 'gemini':
      name = process.env.GEMINI_MODEL;
      break;
  }

  const tag = [provider, name].filter(Boolean).join('-');
  return { ...(provider && { provider }), ...(name && { name }), ...(tag && { tag }) };
}

function writeArtifact(
  relFile: string,
  payload: Record<string, unknown>
): void {
  const runId = randomUUID();
  const model = getModelInfoFromEnv();

  try {
    const filePath = writeDebugRunArtifact(process.cwd(), runId, {
      file: relFile,
      ...(Object.keys(model).length > 0 ? { model } : {}),
      ...(model.tag !== undefined ? { subdir: model.tag } : {}),
      ...payload,
    });
    console.warn(`[vectorlint] Debug JSON written: ${filePath}`);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[vectorlint] Debug JSON write failed: ${message}`);
  }
}

export function writeCheckRoutingDebugArtifact(params: {
  promptFile: PromptFile;
  result: RawCheckResult;
  relFile: string;
  decisions: FilterDecision[];
  surfacedViolations: RawCheckResult['violations'];
}): void {
  const { promptFile, result, relFile, decisions, surfacedViolations } = params;
  writeArtifact(relFile, {
    prompt: {
      pack: promptFile.pack,
      id: (promptFile.meta.id || '').toString(),
      filename: promptFile.filename,
      evaluation_type: 'check',
    },
    raw_model_output: result.raw_model_output ?? null,
    filter_decisions: decisions.map((decision, index) => ({
      index,
      surface: decision.surface,
      reasons: decision.reasons,
    })),
    surfaced_violations: surfacedViolations,
  });
}

export function writeJudgeRoutingDebugArtifact(params: {
  promptFile: PromptFile;
  result: JudgeResult;
  relFile: string;
}): void {
  const { promptFile, result, relFile } = params;
  const flat = result.criteria.flatMap((criterion) =>
    (criterion.violations || []).map((violation, index) => ({
      criterion: criterion.name,
      index,
      violation,
      decision: computeFilterDecision(violation),
    }))
  );

  writeArtifact(relFile, {
    prompt: {
      pack: promptFile.pack,
      id: (promptFile.meta.id || '').toString(),
      filename: promptFile.filename,
      evaluation_type: 'judge',
    },
    raw_model_output: result.raw_model_output ?? null,
    filter_decisions: flat.map((entry) => ({
      criterion: entry.criterion,
      index: entry.index,
      surface: entry.decision.surface,
      reasons: entry.decision.reasons,
    })),
    surfaced_violations: flat.filter((entry) => entry.decision.surface).map((entry) => ({
      criterion: entry.criterion,
      violation: entry.violation,
    })),
  });
}
