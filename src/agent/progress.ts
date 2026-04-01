import { OutputFormat } from '../cli/types';
import * as readline from 'node:readline';
import ora, { type Ora } from 'ora';

const TOOL_PREFIX = '  └ ';
const MAX_TOOL_LINE_LENGTH = 140;

export type VisibleToolName = 'read_file' | 'list_directory' | 'lint';

export interface VisibleToolProgress {
  toolName: VisibleToolName;
  path?: string;
  ruleName?: string;
  ruleText?: string;
  lineCount?: number;
  entryCount?: number;
  findingsCount?: number;
}

export class AgentProgressReporter {
  private readonly enabled: boolean;
  private readonly spinner: Ora | undefined;
  private readonly runStartedAt = Date.now();
  private activeFile: string | undefined;
  private activeRuleName: string | undefined;
  private activeLine = TOOL_PREFIX;

  constructor(enabled: boolean) {
    this.enabled = enabled;
    if (enabled) {
      this.spinner = ora({
        spinner: 'dots',
        stream: createOraStream(process.stderr),
        isEnabled: true,
        discardStdin: false,
        color: false,
      });
    }
  }

  private writeLine(message: string): void {
    if (!this.enabled) {
      return;
    }
    process.stderr.write(`${message}\n`);
  }

  private currentBlockText(): string {
    return `Reviewing ${this.activeFile ?? ''} for ${this.activeRuleName ?? 'Rule'}\n${this.activeLine}`;
  }

  private renderCurrent(): void {
    if (!this.enabled || !this.activeFile || !this.spinner) {
      return;
    }

    const nextText = this.currentBlockText();
    if (!this.spinner.isSpinning) {
      this.spinner.start(nextText);
      return;
    }
    this.spinner.text = nextText;
    this.spinner.render();
  }

  startFile(file: string, ruleName: string): void {
    if (!this.enabled || !this.spinner) {
      return;
    }

    if (this.spinner.isSpinning && this.activeFile && this.activeFile !== file) {
      this.spinner.stopAndPersist({
        symbol: '',
        text: this.currentBlockText(),
      });
    }

    this.activeFile = file;
    this.activeRuleName = ruleName;
    this.activeLine = TOOL_PREFIX;
    this.renderCurrent();
  }

  updateRule(ruleName: string): void {
    if (!this.enabled || !this.activeFile || this.activeRuleName === ruleName) {
      return;
    }

    this.activeRuleName = ruleName;
    this.renderCurrent();
  }

  showVisibleToolStart(params: VisibleToolProgress & { retrying?: boolean }): void {
    if (!this.enabled || !this.activeFile) {
      return;
    }

    if (params.ruleName) {
      this.activeRuleName = params.ruleName;
    }

    this.activeLine = params.retrying
      ? formatRetryingLine(params)
      : formatInvocationLine(params);
    this.renderCurrent();
  }

  showVisibleToolSuccess(params: VisibleToolProgress): void {
    if (!this.enabled || !this.activeFile) {
      return;
    }

    if (params.ruleName) {
      this.activeRuleName = params.ruleName;
    }

    this.activeLine = formatSuccessLine(params);
    this.renderCurrent();
  }

  showVisibleToolError(params: VisibleToolProgress): void {
    if (!this.enabled || !this.activeFile) {
      return;
    }

    if (params.ruleName) {
      this.activeRuleName = params.ruleName;
    }

    this.activeLine = formatErrorLine(params);
    this.renderCurrent();
  }

  finishRun(): void {
    if (!this.enabled) {
      return;
    }

    if (this.spinner?.isSpinning && this.activeFile) {
      this.spinner.stopAndPersist({
        symbol: '',
        text: this.currentBlockText(),
      });
    }
    this.writeLine(`Completed review in ${formatElapsed(this.runStartedAt)}.`);
    this.activeFile = undefined;
    this.activeRuleName = undefined;
    this.activeLine = TOOL_PREFIX;
  }
}

function formatInvocationLine(params: VisibleToolProgress): string {
  switch (params.toolName) {
    case 'read_file':
      return formatToolLine(`Read(${sanitizePath(params.path)})`);
    case 'list_directory':
      return formatToolLine(`List(${sanitizePath(params.path)})`);
    case 'lint':
      return formatToolLine(`Lint("${formatRuleSnippet(params.ruleText)}")`);
  }
}

function formatRetryingLine(params: VisibleToolProgress): string {
  switch (params.toolName) {
    case 'read_file':
      return formatToolLine(`Retrying Read(${sanitizePath(params.path)})...`);
    case 'list_directory':
      return formatToolLine(`Retrying List(${sanitizePath(params.path)})...`);
    case 'lint':
      return formatToolLine(`Retrying Lint("${formatRuleSnippet(params.ruleText)}")...`);
  }
}

function formatSuccessLine(params: VisibleToolProgress): string {
  switch (params.toolName) {
    case 'read_file':
      return formatToolLine(
        `Read ${formatCount(params.lineCount ?? 0, 'line')} from ${sanitizePath(params.path)}`
      );
    case 'list_directory':
      return formatToolLine(
        `Listed ${formatCount(params.entryCount ?? 0, 'entry')} in ${sanitizePath(params.path)}`
      );
    case 'lint':
      if ((params.findingsCount ?? 0) === 0) {
        return formatToolLine(`Found no issues in ${sanitizePath(params.path)}`);
      }
      return formatToolLine(
        `Found ${formatCount(params.findingsCount ?? 0, 'issue')} in ${sanitizePath(params.path)}`
      );
  }
}

function formatErrorLine(params: VisibleToolProgress): string {
  switch (params.toolName) {
    case 'read_file':
      return formatToolLine(`Error reading ${sanitizePath(params.path)}`);
    case 'list_directory':
      return formatToolLine(`Error listing ${sanitizePath(params.path)}`);
    case 'lint':
      return formatToolLine(`Error linting ${sanitizePath(params.path)}`);
  }
}

function formatToolLine(message: string): string {
  return truncate(`${TOOL_PREFIX}${message}`, MAX_TOOL_LINE_LENGTH);
}

function formatRuleSnippet(ruleText: string | undefined): string {
  const sanitized = sanitizeInline(ruleText || '');
  if (sanitized.length === 0) {
    return '...';
  }
  return truncate(`${sanitized}...`, 52);
}

function sanitizePath(path: string | undefined): string {
  const value = sanitizeInline(path || '.');
  return value.length > 0 ? value : '.';
}

function formatCount(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

function sanitizeInline(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, Math.max(0, maxLength - 3))}...`;
}

function formatElapsed(startedAt: number): string {
  const elapsedSeconds = Math.max(0, Math.round((Date.now() - startedAt) / 1000));
  const hours = Math.floor(elapsedSeconds / 3600);
  const minutes = Math.floor((elapsedSeconds % 3600) / 60);
  const seconds = elapsedSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

function createOraStream(stream: NodeJS.WriteStream): NodeJS.WriteStream {
  return {
    ...stream,
    isTTY: stream.isTTY === true,
    columns: stream.columns,
    write: stream.write.bind(stream),
    cursorTo: (x: number) => readline.cursorTo(stream, x),
    clearLine: (dir: -1 | 0 | 1) => readline.clearLine(stream, dir),
    moveCursor: (dx: number, dy: number) => readline.moveCursor(stream, dx, dy),
  } as NodeJS.WriteStream;
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
