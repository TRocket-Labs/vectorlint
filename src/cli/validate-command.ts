import type { Command } from 'commander';
import { existsSync } from 'fs';
import { loadConfig } from '../boundaries/config-loader';
import { loadRuleFile, type PromptFile } from '../prompts/prompt-loader';
import { RulePackLoader } from '../boundaries/rule-pack-loader';
import { PresetLoader } from '../config/preset-loader';
import { validateAll } from '../prompts/prompt-validator';
import { parseValidateOptions } from '../boundaries/index';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { handleUnknownError } from '../errors/index';
import { printFileHeader, printValidationRow } from '../output/reporter';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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
    .option('--evals <dir>', 'override evals directory')
    .action(async (rawOpts: unknown) => {
      // Parse and validate command options
      let validateOptions;
      try {
        validateOptions = parseValidateOptions(rawOpts);
      } catch (e: unknown) {
        const err = handleUnknownError(e, 'Parsing validate command options');
        console.error(`Error: ${err.message}`);
        process.exit(1);
      }

      // Determine rules path (from option or config)
      let rulesPath = validateOptions.evals;
      if (!rulesPath) {
        try {
          rulesPath = loadConfig().rulesPath;
        } catch (e: unknown) {
          const err = handleUnknownError(e, 'Loading configuration');
          console.error(`Error: ${err.message}`);
          process.exit(1);
        }
      }

      // Verify rules path exists
      if (!existsSync(rulesPath)) {
        console.error(`Error: rules path does not exist: ${rulesPath}`);
        process.exit(1);
      }

      // Load prompts with verbose output
      const prompts: PromptFile[] = [];
      const warnings: string[] = [];
      try {
        const presetsDir = path.resolve(__dirname, '../../presets');
        const presetLoader = new PresetLoader(presetsDir);
        const loader = new RulePackLoader(presetLoader);

        const packs = await loader.listAllPacks(rulesPath);


        for (const pack of packs) {
          // pack.path is already absolute
          const rulePaths = await loader.findRuleFiles(pack.path);

          for (const filePath of rulePaths) {
            const result = loadRuleFile(filePath, pack.name);
            if (result.warning) {
              warnings.push(result.warning);
            }
            if (result.prompt) {
              prompts.push(result.prompt);
            }
          }
        }

        if (prompts.length === 0) {
          console.error(`Error: no .md prompts found in any packs in ${rulesPath}`);
          process.exit(1);
        }
      } catch (e: unknown) {
        const err = handleUnknownError(e, 'Loading prompts');
        console.error(`Error: ${err.message}`);
        process.exit(1);
      }

      // Display loader warnings
      if (warnings.length) {
        printFileHeader('Loader');
        for (const w of warnings) printValidationRow('warning', w);
        console.log('');
      }

      // Ensure at least one prompt was found
      if (prompts.length === 0) {
        console.error(`Error: no .md prompts found in ${rulesPath}`);
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
