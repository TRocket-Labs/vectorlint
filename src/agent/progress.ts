import { OutputFormat } from '../cli/types';

const SPINNER_FRAMES = ['|', '/', '-', '\\'];
const TOOL_PREFIX = '└ ';
const MAX_TOOL_LINE_LENGTH = 140;
const DEFAULT_TOOL_NAME = 'lint';

function formatDuration(startedAt: number): string {
  const seconds = Math.max(0, (Date.now() - startedAt) / 1000);
  return `${seconds.toFixed(1)}s`;
}

interface ToolCallProgress {
  ruleName?: string;
  toolArgs?: unknown;
  rulePreview?: string;
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

  private writeInline(message: string): void {
    if (!this.enabled) {
      return;
    }
    process.stderr.write(message);
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
      this.writeInline(`${header}\n${toolLine}`);
      this.hasPrintedBlock = true;
      return;
    }

    this.writeInline(`\x1b[1A\r\x1b[2K${header}\n\r\x1b[2K${toolLine}`);
  }

  startFile(file: string, ruleName: string): void {
    this.fileStartedAt.set(file, Date.now());
    this.activeFile = file;
    this.activeRuleName = ruleName;
    this.activeToolLine = `${TOOL_PREFIX}calling tool ${DEFAULT_TOOL_NAME} tool`;
    if (this.hasPrintedBlock) {
      this.writeLine('');
    }
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

  toolCallStarted(toolName: string, params?: ToolCallProgress): void {
    if (!this.enabled || !this.activeFile) {
      return;
    }

    if (params?.ruleName && params.ruleName !== this.activeRuleName) {
      this.activeRuleName = params.ruleName;
    }

    this.activeToolLine = `${TOOL_PREFIX}calling tool ${toolName} tool ${formatToolCall(
      toolName,
      params?.toolArgs,
      params?.rulePreview
    )}`;
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
      this.writeInline(
        `\x1b[1A\r\x1b[2K◆ done ${file} in ${formatDuration(startedAt)}\n\r\x1b[2K${this.activeToolLine}`
      );
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

    if (this.hasPrintedBlock) {
      this.writeLine('');
    }
    this.writeLine(`◆ done in ${formatDuration(this.runStartedAt)}`);
    this.hasPrintedBlock = false;
  }
}

function formatToolCall(toolName: string, toolArgs?: unknown, rulePreview?: string): string {
  const args = asRecord(toolArgs);
  const sanitizedName = sanitizeInline(toolName);
  if (!args && sanitizedName !== DEFAULT_TOOL_NAME) {
    return `${sanitizedName}()`;
  }

  const entries: string[] = [];

  switch (sanitizedName) {
    case 'read_file':
      pushValueEntry(entries, args?.path);
      pushEntry(entries, 'offset', args?.offset);
      pushEntry(entries, 'limit', args?.limit);
      break;
    case 'search_content':
      pushEntry(entries, 'pattern', args?.pattern);
      pushEntry(entries, 'path', args?.path);
      pushEntry(entries, 'glob', args?.glob);
      pushEntry(entries, 'limit', args?.limit);
      break;
    case 'search_files':
      pushEntry(entries, 'pattern', args?.pattern);
      pushEntry(entries, 'path', args?.path);
      pushEntry(entries, 'limit', args?.limit);
      break;
    case 'list_directory':
      pushEntry(entries, 'path', args?.path);
      pushEntry(entries, 'limit', args?.limit);
      break;
    case 'lint':
      entries.push(
        rulePreview && rulePreview.trim().length > 0
          ? `${truncate(sanitizeInline(rulePreview), 48)}...`
          : '...',
      );
      break;
    default:
      if (args) {
        for (const [key, value] of Object.entries(args).slice(0, 3)) {
          pushEntry(entries, key, value);
        }
      }
      break;
  }

  return truncate(`${sanitizedName}(${entries.join(', ')})`, MAX_TOOL_LINE_LENGTH);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function pushEntry(target: string[], key: string, value: unknown): void {
  if (value === undefined || value === null) return;
  target.push(`${key}:${formatValue(value)}`);
}

function pushValueEntry(target: string[], value: unknown): void {
  if (value === undefined || value === null) return;
  target.push(formatValue(value));
}

function formatValue(value: unknown): string {
  if (typeof value === 'string') {
    return `"${truncate(sanitizeInline(value), 52)}"`;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return '<object>';
}

function sanitizeInline(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 3))}...`;
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
