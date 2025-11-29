import chalk from 'chalk';
import stripAnsi from 'strip-ansi';

export type Status = 'warning' | 'error' | undefined;

function statusLabel(status: Status): string {
  switch (status) {
    case 'error':
      return chalk.red('error');
    case 'warning':
      return chalk.yellow('warning');
    case undefined:
      return '';
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
  // Columns: loc (fixed), severity (fixed), message (fixed wrap), score (fixed), rule/id (unbounded)
  const locWidth = opts.locWidth ?? 7;
  const severityWidth = opts.severityWidth ?? 8;

  // Dynamic width calculation to prevent wrapping while maintaining columns
  // Reserve space for: prefix (~19 chars) + rule column (~30 chars buffer)
  const termCols = process.stdout.columns || 100;
  const prefixOverhead = locWidth + severityWidth + 4; // 4 chars for padding spaces
  const ruleColumnBuffer = 35; // Reserve space for rule name
  const availableForMessage = Math.max(40, termCols - prefixOverhead - ruleColumnBuffer);

  const messageWidth = opts.messageWidth ?? availableForMessage;

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

  // First line with score and rule at end (unbounded)
  console.log(`${prefix}${lines[0]!.padEnd(messageWidth, ' ')}  ${chalk.dim(ruleName || '')}`);
  // Continuation lines
  const contPrefix = ' '.repeat(prefixLen);
  for (let i = 1; i < lines.length; i++) {
    console.log(`${contPrefix}${lines[i]}`);
  }
  // Suggestion for warnings/errors (one cell, next line)
  if (status !== undefined && opts.suggestion) {
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

export function printBasicReport(
  result: { status?: Status; message: string; violations: Array<{ analysis: string; suggestion?: string; pre?: string; post?: string; criterionName?: string }> },
  ruleName: string
) {
  // Skip output entirely if no violations (undefined status)
  if (result.status === undefined) {
    return;
  }

  const status = result.status;
  const message = result.message;

  // Print main status line
  const label = statusLabel(status);
  console.log(`  ${label}  ${message}  ${chalk.dim(ruleName)}`);

  // Print violations
  if (result.violations && result.violations.length > 0) {
    // Check if violations have criterionName for grouping
    const hasCriterionNames = result.violations.some(v => v.criterionName);

    if (hasCriterionNames) {
      // Group violations by criterionName
      const groupedViolations = new Map<string, typeof result.violations>();
      const ungrouped: typeof result.violations = [];

      for (const v of result.violations) {
        if (v.criterionName) {
          if (!groupedViolations.has(v.criterionName)) {
            groupedViolations.set(v.criterionName, []);
          }
          groupedViolations.get(v.criterionName)!.push(v);
        } else {
          ungrouped.push(v);
        }
      }

      // Print grouped violations
      for (const [criterionName, violations] of groupedViolations) {
        console.log(`  ${chalk.cyan(criterionName)}:`);
        for (const v of violations) {
          console.log(`    - ${v.analysis}`);
          if (v.suggestion) {
            console.log(`      Suggestion: ${v.suggestion}`);
          }
        }
      }

      // Print ungrouped violations
      if (ungrouped.length > 0) {
        console.log(`  ${chalk.cyan('Other')}:`);
        for (const v of ungrouped) {
          console.log(`    - ${v.analysis}`);
          if (v.suggestion) {
            console.log(`      Suggestion: ${v.suggestion}`);
          }
        }
      }
    } else {
      // No criterionName, print violations flat
      for (const v of result.violations) {
        console.log(`    - ${v.analysis}`);
        if (v.suggestion) {
          console.log(`      Suggestion: ${v.suggestion}`);
        }
      }
    }
  }
  console.log('');
}

export function printAdvancedReport(
  entries: Array<{ id: string; scoreText: string }>,
  maxScore: number,
  userScore?: number
) {
  // Print criterion scores
  for (const e of entries) {
    console.log(`  ${e.id}  ${e.scoreText}`);
  }

  // Print overall score line
  const fmt = (n: number | undefined) => {
    if (n === undefined || n === null) return '-';
    const r = Math.round(n * 100) / 100;
    return Number.isInteger(r) ? String(r) : r.toFixed(2);
  };
  const top = fmt(maxScore);
  const usr = userScore !== undefined ? fmt(userScore) : '-';
  console.log(`  Top: ${top}, Score: ${usr}`);
}

export function printValidationRow(level: 'error' | 'warning', message: string) {
  const label = level === 'error' ? chalk.red('error') : chalk.yellow('warning');
  console.log(`  ${label}  ${message}`);
}
