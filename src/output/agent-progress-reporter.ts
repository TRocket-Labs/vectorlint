const UNIT_ICON = '◈';
const UNIT_DONE_ICON = '◆';
const TOOL_PREFIX = '└ ';
const MAX_TOOL_LINE_LENGTH = 140;
const DEFAULT_TOOL_NAME = 'lint';

interface ActiveUnit {
  file: string;
  rule: string;
  startTimeMs: number;
  toolLine: string;
}

export interface AgentProgressReporterOptions {
  intervalMs?: number;
}

export class AgentProgressReporter {
  private readonly intervalMs: number;
  private readonly isTty: boolean;
  private readonly frames = ['|', '/', '-', '\\'];

  private frameIndex = 0;
  private runStartMs: number | undefined;
  private timer: NodeJS.Timeout | undefined;
  private activeUnit: ActiveUnit | undefined;
  private hasPrintedUnit = false;

  constructor(options: AgentProgressReporterOptions = {}) {
    this.intervalMs = options.intervalMs ?? 125;
    this.isTty = Boolean(process.stderr.isTTY);
  }

  startRun(): void {
    if (!this.isTty) return;
    this.runStartMs = Date.now();
  }

  startFile(file: string, rule: string): void {
    if (!this.isTty) return;
    if (this.activeUnit) {
      this.finishFile();
    }

    this.activeUnit = {
      file,
      rule,
      startTimeMs: Date.now(),
      toolLine: `${TOOL_PREFIX}${buildCallingToolLine(DEFAULT_TOOL_NAME)}`,
    };

    process.stderr.write('\n');
    this.hasPrintedUnit = true;
    process.stderr.write(`${this.renderActiveHeader()}\n${this.activeUnit.toolLine}`);
    this.startTicker();
  }

  updateRule(rule: string): void {
    if (!this.isTty || !this.activeUnit) return;
    if (this.activeUnit.rule === rule) return;
    this.activeUnit.rule = rule;
    this.activeUnit.toolLine = `${TOOL_PREFIX}${buildCallingToolLine(DEFAULT_TOOL_NAME)}`;
    this.renderActiveBlock(true);
  }

  updateTool(toolName: string, toolArgs?: unknown, rulePreview?: string): void {
    if (!this.isTty || !this.activeUnit) return;
    const nextLine = `${TOOL_PREFIX}${buildCallingToolLine(toolName)} ${formatToolCall(toolName, toolArgs, rulePreview)}`;
    if (nextLine === this.activeUnit.toolLine) return;
    this.activeUnit.toolLine = nextLine;
    this.renderActiveBlock(true);
  }

  finishFile(): void {
    if (!this.isTty || !this.activeUnit) return;

    this.stopTicker();
    const elapsedMs = Math.max(0, Date.now() - this.activeUnit.startTimeMs);
    const doneHeader = `${UNIT_DONE_ICON} done ${this.activeUnit.file} in ${formatDuration(elapsedMs)}`;
    this.renderBlock(doneHeader, this.activeUnit.toolLine);
    this.activeUnit = undefined;
  }

  finishRun(): void {
    if (!this.isTty) return;

    this.finishFile();
    if (!this.runStartMs) return;
    const elapsedMs = Math.max(0, Date.now() - this.runStartMs);
    if (this.hasPrintedUnit) {
      process.stderr.write(`\n${UNIT_DONE_ICON} done in ${formatDuration(elapsedMs)}\n`);
    }
    this.runStartMs = undefined;
    this.hasPrintedUnit = false;
  }

  private startTicker(): void {
    if (!this.isTty || !this.activeUnit) return;
    this.stopTicker();
    this.timer = setInterval(() => this.renderActiveBlock(false), this.intervalMs);
    this.timer.unref?.();
  }

  private stopTicker(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  private renderActiveHeader(): string {
    if (!this.activeUnit) return '';
    const frame = this.frames[this.frameIndex % this.frames.length] || '|';
    this.frameIndex += 1;
    return `${frame} ${UNIT_ICON} reviewing ${this.activeUnit.file} for ${this.activeUnit.rule}`;
  }

  private renderActiveBlock(force: boolean): void {
    if (!this.isTty || !this.activeUnit) return;
    if (!force && !this.timer) return;
    this.renderBlock(this.renderActiveHeader(), this.activeUnit.toolLine);
  }

  private renderBlock(header: string, toolLine: string): void {
    if (!this.isTty) return;
    process.stderr.write('\x1b[1A');
    process.stderr.write(`\r\x1b[2K${header}\n`);
    process.stderr.write(`\r\x1b[2K${toolLine}`);
  }
}

function formatToolCall(toolName: string, toolArgs?: unknown, rulePreview?: string): string {
  const args = asRecord(toolArgs);
  const sanitizedName = sanitizeInline(toolName);
  if (!args && sanitizedName !== 'lint') {
    return `${sanitizedName}()`;
  }

  const entries: string[] = [];

  switch (sanitizedName) {
    case 'read_file':
      pushValueEntry(entries, args.path);
      pushEntry(entries, 'offset', args.offset);
      pushEntry(entries, 'limit', args.limit);
      break;
    case 'search_content':
      pushEntry(entries, 'pattern', args.pattern);
      pushEntry(entries, 'path', args.path);
      pushEntry(entries, 'glob', args.glob);
      pushEntry(entries, 'ignoreCase', args.ignoreCase);
      pushEntry(entries, 'context', args.context);
      pushEntry(entries, 'limit', args.limit);
      break;
    case 'search_files':
      pushEntry(entries, 'pattern', args.pattern);
      pushEntry(entries, 'path', args.path);
      pushEntry(entries, 'limit', args.limit);
      break;
    case 'list_directory':
      pushEntry(entries, 'path', args.path);
      pushEntry(entries, 'limit', args.limit);
      break;
    case 'lint':
      entries.push('...');
      break;
    default:
      for (const [key, value] of Object.entries(args).slice(0, 3)) {
        pushEntry(entries, key, value);
      }
      break;
  }

  const rendered = `${sanitizedName}(${entries.join(', ')})`;
  return truncate(rendered, MAX_TOOL_LINE_LENGTH);
}

function buildCallingToolLine(toolName: string): string {
  const sanitizedName = sanitizeInline(toolName);
  return `calling tool ${sanitizedName} tool`;
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

function formatDuration(elapsedMs: number): string {
  const totalSeconds = Math.floor(elapsedMs / 1000);
  if (totalSeconds < 1) return '<1s';

  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  if (totalMinutes < 1) return `${seconds}s`;

  const minutes = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);
  if (hours < 1) {
    return seconds === 0 ? `${minutes}m` : `${minutes}m ${seconds}s`;
  }

  if (minutes === 0 && seconds === 0) return `${hours}h`;
  if (seconds === 0) return `${hours}h ${minutes}m`;
  return `${hours}h ${minutes}m ${seconds}s`;
}
