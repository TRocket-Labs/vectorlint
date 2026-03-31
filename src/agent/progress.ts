import { OutputFormat } from '../cli/types';

const SPINNER_FRAMES = ['|', '/', '-', '\\'];

function formatDuration(startedAt: number): string {
  const seconds = Math.max(0, (Date.now() - startedAt) / 1000);
  return `${seconds.toFixed(1)}s`;
}

export class AgentProgressReporter {
  private readonly enabled: boolean;
  private spinnerIndex = 0;
  private readonly runStartedAt = Date.now();
  private readonly fileStartedAt = new Map<string, number>();

  constructor(enabled: boolean) {
    this.enabled = enabled;
  }

  private writeLine(message: string): void {
    if (!this.enabled) {
      return;
    }
    process.stderr.write(`${message}\n`);
  }

  startFile(file: string, ruleName: string): void {
    this.fileStartedAt.set(file, Date.now());
    const frame = SPINNER_FRAMES[this.spinnerIndex % SPINNER_FRAMES.length];
    this.spinnerIndex += 1;
    this.writeLine(`${frame} ◈ reviewing ${file} for ${ruleName}`);
  }

  toolCallStarted(toolName: string): void {
    this.writeLine(`└ calling tool ${toolName} tool`);
  }

  finishFile(file: string): void {
    const startedAt = this.fileStartedAt.get(file) ?? this.runStartedAt;
    this.writeLine(`◆ done ${file} in ${formatDuration(startedAt)}`);
  }

  finishRun(): void {
    this.writeLine(`◆ done in ${formatDuration(this.runStartedAt)}`);
  }
}

export function shouldEmitAgentProgress(params: { outputFormat: OutputFormat; printMode: boolean }): boolean {
  const { outputFormat, printMode } = params;
  if (printMode) {
    return false;
  }
  if (outputFormat !== OutputFormat.Line) {
    return false;
  }
  return process.stderr.isTTY === true;
}
