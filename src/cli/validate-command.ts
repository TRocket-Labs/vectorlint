import type { Command } from 'commander';
import { existsSync } from 'fs';
import { loadConfig } from '../boundaries/config-loader';
import { loadPrompts } from '../prompts/prompt-loader';
import { validateAll } from '../prompts/prompt-validator';
import { parseValidateOptions } from '../boundaries/index';
import { handleUnknownError } from '../errors/index';
import { printFileHeader, printValidationRow } from '../output/reporter';

/*
 * Registers the 'validate' command with Commander.
 * This command validates prompt configuration files without running evaluations.
 * It checks YAML frontmatter structure, schema compliance, and prompt completeness.
 * 
 * Note: process.exit is intentional in CLI commands to set proper exit codes.
 */
export function registerValidateCommand(program: Command): void {
  program
    .command('validate')
    .description('Validate prompt configuration files')
    .option('--prompts <dir>', 'override prompts directory')
    .action((rawOpts: unknown) => {
      // Parse and validate command options
      let validateOptions;
      try {
        validateOptions = parseValidateOptions(rawOpts);
      } catch (e: unknown) {
        const err = handleUnknownError(e, 'Parsing validate command options');
        console.error(`Error: ${err.message}`);
        process.exit(1);
      }

      // Determine prompts path (from option or config)
      let promptsPath = validateOptions.prompts;
      if (!promptsPath) {
        try {
          promptsPath = loadConfig().promptsPath;
        } catch (e: unknown) {
          const err = handleUnknownError(e, 'Loading configuration');
          console.error(`Error: ${err.message}`);
          process.exit(1);
        }
      }

      // Verify prompts path exists
      if (!existsSync(promptsPath)) {
        console.error(`Error: prompts path does not exist: ${promptsPath}`);
        process.exit(1);
      }

      // Load prompts with verbose output
      let loaded;
      try {
        loaded = loadPrompts(promptsPath, { verbose: true });
      } catch (e: unknown) {
        const err = handleUnknownError(e, 'Loading prompts');
        console.error(`Error: ${err.message}`);
        process.exit(1);
      }

      const { prompts, warnings } = loaded;

      // Display loader warnings
      if (warnings.length) {
        printFileHeader('Loader');
        for (const w of warnings) printValidationRow('warning', w);
        console.log('');
      }

      // Ensure at least one prompt was found
      if (prompts.length === 0) {
        console.error(`Error: no .md prompts found in ${promptsPath}`);
        process.exit(1);
      }

      // Validate all prompts
      const result = validateAll(prompts);

      // Group errors and warnings by file
      const byFile = new Map<string, { e: string[]; w: string[] }>();
      for (const e of result.errors) {
        const g = byFile.get(e.file) || { e: [], w: [] };
        g.e.push(e.message);
        byFile.set(e.file, g);
      }
      for (const w of result.warnings) {
        const g = byFile.get(w.file) || { e: [], w: [] };
        g.w.push(w.message);
        byFile.set(w.file, g);
      }

      // Print grouped results
      for (const [file, g] of byFile) {
        printFileHeader(file);
        for (const m of g.e) printValidationRow('error', m);
        for (const m of g.w) printValidationRow('warning', m);
        console.log('');
      }

      // Print summary
      const totalErrs = result.errors.length;
      const totalWarns = result.warnings.length;
      const okMark = totalErrs === 0 ? '✓' : '✖';
      console.log(
        `${okMark} ${totalErrs} errors, ${totalWarns} warnings in ${prompts.length} prompt(s).`
      );

      // Exit with appropriate code
      process.exit(totalErrs > 0 ? 1 : 0);
    });
}
