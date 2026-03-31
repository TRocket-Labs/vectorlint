import * as path from 'path';

const SPINNER = '⠋';

export interface AgentProgressReporterOptions {
  enabled: boolean;
}

export class AgentProgressReporter {
  private readonly enabled: boolean;
  private readonly startedAt = Date.now();
  private activeFile: string | null = null;
  private activeFileStartedAt = 0;
  private hasOutput = false;

  constructor(options: AgentProgressReporterOptions) {
    this.enabled = options.enabled;
  }

  onLintContext(file: string, ruleSource: string): void {
    if (!this.enabled) return;

    if (this.activeFile && this.activeFile !== file) {
      this.completeActiveFile();
    }

    if (this.activeFile !== file) {
      this.activeFile = file;
      this.activeFileStartedAt = Date.now();
      const line = `${SPINNER} ◈ reviewing ${file} for ${ruleSource}`;
      this.writeNewLine(line);
      return;
    }

    const line = `${SPINNER} ◈ reviewing ${file} for ${ruleSource}`;
    this.rewriteLine(line);
  }

  onToolCall(toolName: string, input: Record<string, unknown>): void {
    if (!this.enabled) return;
    const line = `└ calling tool ${toolName} tool ${this.compactDetail(toolName, input)}`.trimEnd();
    this.rewriteLine(line);
  }

  onRunFinished(): void {
    if (!this.enabled) return;
    this.completeActiveFile();
    const duration = this.formatDuration(Date.now() - this.startedAt);
    this.writeNewLine(`◆ done in ${duration}`);
  }

  beforeFindings(): void {
    if (!this.enabled) return;
    if (this.hasOutput) {
      process.stderr.write('\n');
      this.hasOutput = false;
    }
  }

  private completeActiveFile(): void {
    if (!this.activeFile) {
      return;
    }
    const duration = this.formatDuration(Date.now() - this.activeFileStartedAt);
    this.writeNewLine(`◆ done ${this.activeFile} in ${duration}`);
    this.activeFile = null;
    this.activeFileStartedAt = 0;
  }

  private compactDetail(toolName: string, input: Record<string, unknown>): string {
    if (toolName === 'read_file') {
      return this.valueToCompactText(input.path);
    }
    if (toolName === 'list_directory') {
      return this.valueToCompactText(input.path);
    }
    if (toolName === 'search_files') {
      const raw = this.valueToCompactText(input.pattern);
      const firstToken = raw.split(/\s+/).filter(Boolean)[0] ?? '';
      return firstToken;
    }
    if (toolName === 'lint') {
      const raw = this.valueToCompactText(input.ruleSource);
      const compact = path.basename(raw).replace(/\.md$/i, '').slice(0, 24).replace(/\.+$/, '');
      return `lint(${compact}...)`;
    }
    return '';
  }

  private valueToCompactText(value: unknown): string {
    if (typeof value === 'string') {
      return value.trim();
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
    return '';
  }

  private formatDuration(ms: number): string {
    if (ms < 1000) {
      return `${ms}ms`;
    }
    return `${(ms / 1000).toFixed(1)}s`;
  }

  private rewriteLine(line: string): void {
    process.stderr.write(`\r\x1b[2K${line}`);
    this.hasOutput = true;
  }

  private writeNewLine(line: string): void {
    if (this.hasOutput) {
      process.stderr.write('\n');
      this.hasOutput = false;
    }
    process.stderr.write(`${line}\n`);
  }
}
