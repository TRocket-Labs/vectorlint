import chalk from 'chalk';
import stripAnsi from 'strip-ansi';

export type Status = 'ok' | 'warning' | 'error';

function statusLabel(status: Status): string {
  switch (status) {
    case 'error':
      return chalk.red('error');
    case 'warning':
      return chalk.yellow('warning');
    default:
      return chalk.green('ok');
  }
}

export function printFileHeader(fileRelPath: string) {
  console.log(chalk.underline(fileRelPath));
}

export function printPromptHeader(promptName: string) {
  console.log(`  ${chalk.cyan(promptName)}`);
}

export function printOverall(overall: number, max: number) {
  console.log(`    Overall: ${chalk.bold(overall.toFixed(2))}/${max}`);
}

export function printIssueRow(
  loc: string,
  status: Status,
  summary: string,
  ruleName: string,
  opts: { locWidth?: number; severityWidth?: number; messageWidth?: number; suggestion?: string } = {}
) {
  // Columns: loc (fixed), severity (fixed), message (fixed wrap), rule/id (unbounded; let terminal wrap)
  const locWidth = opts.locWidth ?? 7;
  const severityWidth = opts.severityWidth ?? 8;
  const messageWidth = opts.messageWidth ?? 60;

  const locCell = (loc || '').padEnd(locWidth, ' ');
  const colored = statusLabel(status);
  const visibleLen = stripAnsi(colored).length;
  const pad = Math.max(0, severityWidth - visibleLen);
  const paddedLabel = colored + ' '.repeat(pad);
  const prefix = `  ${locCell} ${paddedLabel}  `; // extra space after severity
  const prefixLen = stripAnsi(prefix).length;

  // No fixed width or chunking for rule; print raw id and let terminal wrap
  const words = (summary || '').split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const w of words) {
    if (stripAnsi(current).length + (current ? 1 : 0) + w.length > messageWidth) {
      lines.push(current);
      current = w;
    } else {
      current = current ? `${current} ${w}` : w;
    }
  }
  if (current) lines.push(current);

  if (lines.length === 0) {
    lines.push('');
  }

  // First line with rule at end (unbounded)
  console.log(`${prefix}${lines[0].padEnd(messageWidth, ' ')}  ${chalk.dim(ruleName || '')}`);
  // Continuation lines
  const contPrefix = ' '.repeat(prefixLen);
  for (let i = 1; i < lines.length; i++) {
    console.log(`${contPrefix}${lines[i]}`);
  }
  // Suggestion for warnings/errors (one cell, next line)
  if (status !== 'ok' && opts.suggestion) {
    const words = opts.suggestion.split(/\s+/).filter(Boolean);
    const suggPrefix = `${contPrefix}`;
    let curr = 'suggestion: ';
    for (const w of words) {
      if (stripAnsi(curr).length + (curr ? 1 : 0) + w.length > messageWidth) {
        console.log(`${suggPrefix}${curr}`);
        curr = w;
      } else {
        curr = curr ? `${curr} ${w}` : w;
      }
    }
    if (curr) console.log(`${suggPrefix}${curr}`);
  }
  // No manual rule overflow handling to keep id truly unfixed-width
  // Blank line after each row block
  console.log('');
}

export function printPromptSummary(errors: number, warnings: number) {
  const okMark = errors === 0 ? chalk.green('✓') : chalk.red('✖');
  const errTxt = errors > 0 ? chalk.red(`${errors} error${errors !== 1 ? 's' : ''}`) : '0 errors';
  const warnTxt = warnings > 0 ? chalk.yellow(`${warnings} warning${warnings !== 1 ? 's' : ''}`) : '0 warnings';
  console.log(`  ${okMark} ${errTxt}, ${warnTxt} in prompt`);
}

export function printFileSummary(errors: number, warnings: number) {
  const okMark = errors === 0 ? chalk.green('✓') : chalk.red('✖');
  const errTxt = errors > 0 ? chalk.red(`${errors} error${errors !== 1 ? 's' : ''}`) : '0 errors';
  const warnTxt = warnings > 0 ? chalk.yellow(`${warnings} warning${warnings !== 1 ? 's' : ''}`) : '0 warnings';
  console.log(`${okMark} ${errTxt}, ${warnTxt} in file`);
}

export function printGlobalSummary(files: number, errors: number, warnings: number, failures: number = 0) {
  const okMark = errors === 0 ? chalk.green('✓') : chalk.red('✖');
  const errTxt = errors === 1 ? '1 error' : `${errors} errors`;
  const warnTxt = warnings === 1 ? '1 warning' : `${warnings} warnings`;
  const suggestionTxt = '0 suggestions';
  const fileTxt = files === 1 ? '1 file' : `${files} files`;
  const coloredErr = errors > 0 ? chalk.red(errTxt) : chalk.green(errTxt);
  const coloredWarn = warnings > 0 ? chalk.yellow(warnTxt) : chalk.green(warnTxt);
  console.log(`${okMark} ${coloredErr}, ${coloredWarn} and ${suggestionTxt} in ${fileTxt}.`);
  if (failures > 0) {
    const failTxt = failures === 1 ? '1 request failure' : `${failures} request failures`;
    console.log(chalk.red(`✖ ${failTxt}`));
  }
}
