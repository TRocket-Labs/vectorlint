import { OutputFormat } from '../cli/types';

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
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
  private spinnerIndex = 0;
  private activeFile: string | undefined;
  private activeRuleName: string | undefined;
  private activeLine = TOOL_PREFIX;
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
    return `${frame} Reviewing ${file} for ${ruleName}`;
  }

  private renderBlock(header: string, detailLine: string): void {
    if (!this.enabled) {
      return;
    }

    if (!this.hasPrintedBlock) {
      this.writeInline(`${header}\n${detailLine}`);
      this.hasPrintedBlock = true;
      return;
    }

    this.writeInline(`\x1b[1A\r\x1b[2K${header}\n\r\x1b[2K${detailLine}`);
  }

  private renderCurrent(): void {
    if (!this.enabled || !this.activeFile) {
      return;
    }
    this.renderBlock(
      this.renderHeader(this.activeFile, this.activeRuleName ?? 'Rule'),
      this.activeLine
    );
  }

  startFile(file: string, ruleName: string): void {
    if (!this.enabled) {
      return;
    }

    if (this.hasPrintedBlock && this.activeFile && this.activeFile !== file) {
      this.writeLine('');
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

    if (this.hasPrintedBlock) {
      this.writeLine('');
    }
    this.writeLine('Completed review.');
    this.hasPrintedBlock = false;
    this.activeFile = undefined;
    this.activeRuleName = undefined;
    this.activeLine = TOOL_PREFIX;
  }
}

function formatInvocationLine(params: VisibleToolProgress): string {
  switch (params.toolName) {
    case 'read_file':
      return `${TOOL_PREFIX}Read(${sanitizePath(params.path)})`;
    case 'list_directory':
      return `${TOOL_PREFIX}List(${sanitizePath(params.path)})`;
    case 'lint':
      return `${TOOL_PREFIX}Lint("${formatRuleSnippet(params.ruleText)}")`;
  }
}

function formatRetryingLine(params: VisibleToolProgress): string {
  switch (params.toolName) {
    case 'read_file':
      return `${TOOL_PREFIX}Retrying Read(${sanitizePath(params.path)})...`;
    case 'list_directory':
      return `${TOOL_PREFIX}Retrying List(${sanitizePath(params.path)})...`;
    case 'lint':
      return `${TOOL_PREFIX}Retrying Lint("${formatRuleSnippet(params.ruleText)}")...`;
  }
}

function formatSuccessLine(params: VisibleToolProgress): string {
  switch (params.toolName) {
    case 'read_file':
      return `${TOOL_PREFIX}Read ${formatCount(params.lineCount ?? 0, 'line')} from ${sanitizePath(params.path)}`;
    case 'list_directory':
      return `${TOOL_PREFIX}Listed ${formatCount(params.entryCount ?? 0, 'entry')} in ${sanitizePath(params.path)}`;
    case 'lint':
      if ((params.findingsCount ?? 0) === 0) {
        return `${TOOL_PREFIX}Found no issues in ${sanitizePath(params.path)}`;
      }
      return `${TOOL_PREFIX}Found ${formatCount(params.findingsCount ?? 0, 'issue')} in ${sanitizePath(params.path)}`;
  }
}

function formatErrorLine(params: VisibleToolProgress): string {
  switch (params.toolName) {
    case 'read_file':
      return `${TOOL_PREFIX}Error reading ${sanitizePath(params.path)}`;
    case 'list_directory':
      return `${TOOL_PREFIX}Error listing ${sanitizePath(params.path)}`;
    case 'lint':
      return `${TOOL_PREFIX}Error linting ${sanitizePath(params.path)}`;
  }
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
