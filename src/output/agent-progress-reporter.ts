export interface AgentProgressReporter {
  onReviewContext(file: string, ruleSource: string): void;
  onToolCall(toolName: string, detail?: string): void;
  onFileDone(file: string, durationMs: number): void;
  onRunDone(durationMs: number): void;
  onFindingsStart(): void;
}

interface ProgressReporterOptions {
  write: (text: string) => void;
}

function compactRulePreview(ruleSource: string): string {
  const compact = ruleSource.length > 48 ? `${ruleSource.slice(0, 48)}` : ruleSource;
  return `${compact}...`;
}

function formatDuration(durationMs: number): string {
  if (durationMs < 1000) {
    return `${durationMs}ms`;
  }
  const seconds = (durationMs / 1000).toFixed(2);
  return `${seconds}s`;
}

export function createAgentProgressReporter(
  options: ProgressReporterOptions
): AgentProgressReporter {
  let activeFile: string | undefined;
  const spinner = "⠋";

  return {
    onReviewContext(file, ruleSource) {
      const line = `${spinner} ◈ reviewing ${file} for ${ruleSource}`;
      if (activeFile === file) {
        options.write(`\r${line}`);
        return;
      }
      activeFile = file;
      options.write(`${line}\n`);
    },
    onToolCall(toolName, detail) {
      let suffix = "";
      if (toolName === "lint") {
        suffix = ` lint(${compactRulePreview(detail ?? "")})`;
      } else if (
        toolName === "read_file" ||
        toolName === "list_directory" ||
        toolName === "search_files"
      ) {
        suffix = detail ? ` ${detail}` : "";
      }
      options.write(`└ calling tool ${toolName} tool${suffix}\n`);
    },
    onFileDone(file, durationMs) {
      options.write(`◆ done ${file} in ${formatDuration(durationMs)}\n`);
    },
    onRunDone(durationMs) {
      options.write(`◆ done in ${formatDuration(durationMs)}\n`);
    },
    onFindingsStart() {
      options.write("\n");
    },
  };
}
