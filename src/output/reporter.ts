import chalk from 'chalk';
import stripAnsi from 'strip-ansi';
import path from 'path';
import { Severity } from '../evaluators/types';
import { TokenUsageStats } from '../types/token-usage';

export interface EvaluationSummary {
  id: string;
  scoreText: string;
  score?: number;
}

export type Status = Severity;

function statusLabel(status: Status): string {
  switch (status) {
    case Severity.ERROR:
      return chalk.red('error');
    case Severity.WARNING:
      return chalk.yellow('warning');
  }
}

export function printFileHeader(fileRelPath: string) {
  const cwd = process.cwd();
  const absPath = path.resolve(cwd, fileRelPath);
  // OSC 8 hyperlink
  const link = `\u001B]8;;file://${absPath}\u0007${fileRelPath}\u001B]8;;\u0007`;
  console.log(chalk.underline(link));
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
  // Reserve space for: prefix (~19 chars) + rule column (~25 chars buffer)
  const termCols = process.stdout.columns || 100;
  const prefixOverhead = locWidth + severityWidth + 4; // 4 chars for padding spaces
  const ruleColumnBuffer = 25; // Reduced buffer to avoid excessive gaps
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
  if (opts.suggestion) {
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

export function printGlobalSummary(files: number, errors: number, warnings: number, failures: number = 0) {
  const okMark = errors === 0 ? chalk.green('✓') : chalk.red('✖');
  const errTxt = errors === 1 ? '1 error' : `${errors} errors`;
  const warnTxt = warnings === 1 ? '1 warning' : `${warnings} warnings`;
  const fileTxt = files === 1 ? '1 file' : `${files} files`;

  const coloredErr = errors > 0 ? chalk.red(errTxt) : chalk.green(errTxt);
  const coloredWarn = chalk.yellow(warnTxt);

  // "X errors and Y warnings in Z files."
  console.log(`${okMark} ${coloredErr} and ${coloredWarn} in ${fileTxt}.`);

  if (failures > 0) {
    const failTxt = failures === 1 ? '1 request failure' : `${failures} request failures`;
    console.log(chalk.red(`✖ ${failTxt}`));
  }
}

export function printEvaluationSummaries(
  summaries: Map<string, EvaluationSummary[]>
) {
  if (summaries.size === 0) return;

  console.log('');
  console.log(chalk.bold('\nQuality Scores:'));

  for (const [evalName, items] of summaries) {
    console.log(`  ${chalk.cyan(evalName)}:`);
    // Find max ID length for alignment
    const maxIdLen = Math.max(...items.map(i => i.id.length));

    for (const item of items) {
      const paddedId = item.id.split('.').pop()!.padEnd(maxIdLen + 2, ' ');
      let coloredScoreText = item.scoreText;
      if (item.score !== undefined) {
        const scoreVal = item.score;
        const scoreStr = scoreVal.toFixed(1);
        let coloredScore: string;

        if (scoreVal >= 9.0) {
          coloredScore = chalk.greenBright(scoreStr);
        } else if (scoreVal >= 7.0) {
          coloredScore = chalk.green(scoreStr);
        } else if (scoreVal >= 5.0) {
          coloredScore = chalk.yellow(scoreStr);
        } else {
          coloredScore = chalk.red(scoreStr);
        }

        // Reconstruct the score text with color, assuming format "X.X/10"
        coloredScoreText = `${coloredScore}/10`;
      }
      console.log(`    ${paddedId}${coloredScoreText}`);
    }
  }
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

export function printTokenUsage(stats: TokenUsageStats) {
  console.log(chalk.bold('\nToken Usage:'));
  console.log(`  - Input tokens: ${stats.totalInputTokens.toLocaleString()}`);
  console.log(`  - Output tokens: ${stats.totalOutputTokens.toLocaleString()}`);
  if (stats.totalCost !== undefined) {
    console.log(`  - Total cost: $${stats.totalCost.toFixed(4)}`);
  }
}
