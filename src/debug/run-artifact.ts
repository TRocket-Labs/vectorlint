import { mkdirSync, writeFileSync } from "fs";
import path from "path";

export type DebugRunArtifact = {
  run_id: string;
  timestamp: string;
  file: string;
  model?: {
    provider?: string;
    name?: string;
    tag?: string;
  };
  prompt: {
    pack?: string;
    id?: string;
    filename?: string;
    evaluation_type?: string;
  };
  raw_model_output: unknown;
  filter_decisions: unknown;
  surfaced_violations: unknown;
};

function sanitizePathSegment(input: string): string {
  const cleaned = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return cleaned.slice(0, 80) || "unknown";
}

export function writeDebugRunArtifact(
  cwd: string,
  runId: string,
  artifact: Omit<DebugRunArtifact, "run_id" | "timestamp"> &
    Partial<Pick<DebugRunArtifact, "timestamp">> & {
      subdir?: string;
    }
): string {
  const baseDir = path.resolve(cwd, ".vectorlint", "runs");
  const dir = artifact.subdir
    ? path.join(baseDir, sanitizePathSegment(artifact.subdir))
    : baseDir;
  mkdirSync(dir, { recursive: true });

  const timestamp = artifact.timestamp || new Date().toISOString();
  const full: DebugRunArtifact = {
    run_id: runId,
    timestamp,
    file: artifact.file,
    ...(artifact.model ? { model: artifact.model } : {}),
    prompt: artifact.prompt,
    raw_model_output: artifact.raw_model_output,
    filter_decisions: artifact.filter_decisions,
    surfaced_violations: artifact.surfaced_violations,
  };

  const safeRunId = sanitizePathSegment(runId);
  const filePath = path.join(dir, `${safeRunId}.json`);
  writeFileSync(filePath, JSON.stringify(full, null, 2), "utf-8");
  return filePath;
}
