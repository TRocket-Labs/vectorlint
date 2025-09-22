import chalk from 'chalk';
import { Issue } from '../analyzer/types.js';

export class Formatter {
  static formatIssues(filePath: string, issues: Issue[]): string {
    if (issues.length === 0) {
      return chalk.green('✨ All checks passed!');
    }

    let output = chalk.bold(filePath) + '\n';
    
    for (const issue of issues) {
      const severity = issue.severity === 'error' 
        ? chalk.red('error')
        : chalk.yellow('warning');
      
      output += `  ${issue.line}:${issue.column || 0}  ${severity}  ${issue.message}  ${chalk.dim(issue.rule)}\n`;
    }

    const errorCount = issues.filter(i => i.severity === 'error').length;
    const warningCount = issues.filter(i => i.severity === 'warning').length;
    
    output += '\n';
    if (errorCount > 0) {
      output += chalk.red(`❌ ${errorCount} error${errorCount > 1 ? 's' : ''}`);
    }
    if (warningCount > 0) {
      if (errorCount > 0) output += ', ';
      output += chalk.yellow(`${warningCount} warning${warningCount > 1 ? 's' : ''}`);
    }
    
    return output;
  }
}
