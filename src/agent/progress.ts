import { OutputFormat } from '../cli/types';

const SPINNER_FRAMES = ['|', '/', '-', '\\'];
const TOOL_PREFIX = '└ ';

function formatDuration(startedAt: number): string {
  const seconds = Math.max(0, (Date.now() - startedAt) / 1000);
  return `${seconds.toFixed(1)}s`;
}

export class AgentProgressReporter {
  private readonly enabled: boolean;
  private spinnerIndex = 0;
  private readonly runStartedAt = Date.now();
  private readonly fileStartedAt = new Map<string, number>();
  private activeFile: string | undefined;
  private activeRuleName: string | undefined;
  private activeToolLine = `${TOOL_PREFIX}calling tool lint tool`;
  private hasPrintedBlock = false;

  constructor(enabled: boolean) {
    this.enabled = enabled;
  }

  private writeLine(message: string): void {
    if (!this.enabled) {
      return;
    }
    process.stderr.write(`${message}\n`);
  }

  private renderHeader(file: string, ruleName: string): string {
    const frame = SPINNER_FRAMES[this.spinnerIndex % SPINNER_FRAMES.length];
    this.spinnerIndex += 1;
    return `${frame} ◈ reviewing ${file} for ${ruleName}`;
  }

  private renderBlock(header: string, toolLine: string): void {
    if (!this.enabled) {
      return;
    }

    if (!this.hasPrintedBlock) {
      this.writeLine(header);
      this.writeLine(toolLine);
      this.hasPrintedBlock = true;
      return;
    }

    process.stderr.write('\x1b[1A');
    process.stderr.write(`\r\x1b[2K${header}\n`);
    process.stderr.write(`\r\x1b[2K${toolLine}`);
  }

  startFile(file: string, ruleName: string): void {
    this.fileStartedAt.set(file, Date.now());
    this.activeFile = file;
    this.activeRuleName = ruleName;
    this.activeToolLine = `${TOOL_PREFIX}calling tool lint tool`;
    this.renderBlock(this.renderHeader(file, ruleName), this.activeToolLine);
  }

  updateRule(ruleName: string): void {
    if (!this.enabled || !this.activeFile) {
      return;
    }
    if (this.activeRuleName === ruleName) {
      return;
    }
    this.activeRuleName = ruleName;
    this.renderBlock(this.renderHeader(this.activeFile, ruleName), this.activeToolLine);
  }

  toolCallStarted(toolName: string, ruleName?: string): void {
    if (!this.enabled || !this.activeFile) {
      return;
    }

    if (ruleName && ruleName !== this.activeRuleName) {
      this.activeRuleName = ruleName;
    }

    this.activeToolLine = `${TOOL_PREFIX}calling tool ${toolName} tool`;
    this.renderBlock(
      this.renderHeader(this.activeFile, this.activeRuleName ?? 'Rule'),
      this.activeToolLine
    );
  }

  finishFile(file: string): void {
    const startedAt = this.fileStartedAt.get(file) ?? this.runStartedAt;
    if (!this.enabled) {
      return;
    }

    if (this.activeFile === file && this.hasPrintedBlock) {
      process.stderr.write('\x1b[1A');
      process.stderr.write(`\r\x1b[2K◆ done ${file} in ${formatDuration(startedAt)}\n`);
      process.stderr.write(`\r\x1b[2K${this.activeToolLine}`);
      this.activeFile = undefined;
      this.activeRuleName = undefined;
      return;
    }

    this.writeLine(`◆ done ${file} in ${formatDuration(startedAt)}`);
  }

  finishRun(): void {
    if (!this.enabled) {
      return;
    }
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
