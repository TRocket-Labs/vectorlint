import type { Command } from 'commander';
import { existsSync } from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { createProvider } from '../providers/provider-factory';
import { PerplexitySearchProvider } from '../providers/perplexity-provider';
import type { SearchProvider } from '../providers/search-provider';
import { loadConfig } from '../boundaries/config-loader';
import { loadRuleFile, type PromptFile } from '../prompts/prompt-loader';
import { RulePackLoader } from '../boundaries/rule-pack-loader';
import { PresetLoader } from '../config/preset-loader';
import { printGlobalSummary } from '../output/reporter';
import { DefaultRequestBuilder } from '../providers/request-builder';
import { loadDirective } from '../prompts/directive-loader';
import { resolveTargets } from '../scan/file-resolver';
import { parseCliOptions, parseEnvironment } from '../boundaries/index';
import { handleUnknownError } from '../errors/index';
import { evaluateFiles } from './orchestrator';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/*
 * Registers the main evaluation command with Commander.
 * This is the default command that runs content evaluations against target files.
 */
export function registerMainCommand(program: Command): void {
  program
    .option('-v, --verbose', 'Enable verbose logging')
    .option('--show-prompt', 'Print full prompt and injected content')
    .option('--show-prompt-trunc', 'Print truncated prompt/content previews (500 chars)')
    .option('--debug-json', 'Print full JSON response from the API')
    .option('--output <format>', 'Output format: line (default), json, or vale-json, rdjson', 'line')
    .option('--config <path>', 'Path to custom vectorlint.ini config file')
    .argument('[paths...]', 'files or directories to check (optional)')
    .action(async (paths: string[] = []) => {

      // Parse and validate CLI options
      let cliOptions;
      try {
        cliOptions = parseCliOptions(program.opts());
      } catch (e: unknown) {
        const err = handleUnknownError(e, 'Parsing CLI options');
        console.error(`Error: ${err.message}`);
        process.exit(1);
      }

      // Parse and validate environment variables
      let env;
      try {
        env = parseEnvironment();
      } catch (e: unknown) {
        const err = handleUnknownError(e, 'Validating environment variables');
        console.error(`Error: ${err.message}`);
        console.error('Please set these in your .env file or environment.');
        process.exit(1);
      }

      // Load directive and create provider
      let directive;
      try {
        directive = loadDirective();
      } catch (e: unknown) {
        const err = handleUnknownError(e, 'Loading directive');
        console.error(`Error: ${err.message}`);
        process.exit(1);
      }

      const provider = createProvider(
        env,
        {
          debug: cliOptions.verbose,
          showPrompt: cliOptions.showPrompt,
          showPromptTrunc: cliOptions.showPromptTrunc,
          debugJson: cliOptions.debugJson,
        },
        new DefaultRequestBuilder(directive)
      );

      if (cliOptions.verbose) {
        const directiveLen = directive ? directive.length : 0;
        console.log(`[vectorlint] Directive active: ${directiveLen} char(s)`);
      }

      // Load config and prompts
      let config;
      try {
        config = loadConfig(process.cwd(), cliOptions.config);
      } catch (e: unknown) {
        const err = handleUnknownError(e, 'Loading configuration');
        console.error(`Error: ${err.message}`);
        process.exit(1);
      }

      const { rulesPath } = config;
      if (!existsSync(rulesPath)) {
        console.error(`Error: rules path does not exist: ${rulesPath}`);
        process.exit(1);
      }

      const prompts: PromptFile[] = [];
      try {
        const presetsDir = path.resolve(__dirname, '../../presets');
        const presetLoader = new PresetLoader(presetsDir);
        const loader = new RulePackLoader(presetLoader);

        const packs = await loader.listAllPacks(rulesPath);

        if (packs.length === 0 && cliOptions.verbose) {
          console.warn(`[vectorlint] Warning: No rule packs (subdirectories) found in ${rulesPath} or presets.`);
          console.warn(`[vectorlint] Please organize your rules into subdirectories or use a valid preset.`);
        }

        for (const pack of packs) {
          // pack.path is already absolute
          const rulePaths = await loader.findRuleFiles(pack.path);

          for (const filePath of rulePaths) {
            const result = loadRuleFile(filePath, pack.name);
            if (result.warning) {
              if (cliOptions.verbose) console.warn(`[vectorlint] ${result.warning}`);
            }
            if (result.prompt) {
              prompts.push(result.prompt);
            }
          }
        }

        if (prompts.length === 0) {
          console.error(`Error: no .md rules found in any packs in ${rulesPath}`);
          process.exit(1);
        }
      } catch (e: unknown) {
        const err = handleUnknownError(e, 'Loading prompts');
        console.error(`Error: failed to load prompts: ${err.message}`);
        process.exit(1);
      }

      // Resolve target files
      let targets: string[] = [];
      try {
        targets = resolveTargets({
          cliArgs: paths,
          cwd: process.cwd(),
          rulesPath,
          scanPaths: config.scanPaths,
          configDir: config.configDir,
        });
      } catch (e: unknown) {
        const err = handleUnknownError(e, 'Resolving target files');
        console.error(`Error: failed to resolve target files: ${err.message}`);
        process.exit(1);
      }

      if (targets.length === 0) {
        console.error('Error: no target files found to evaluate.');
        process.exit(1);
      }



      // Create search provider if API key is available
      const searchProvider: SearchProvider | undefined = process.env.PERPLEXITY_API_KEY
        ? new PerplexitySearchProvider({ debug: false })
        : undefined;

      const outputFormat = cliOptions.output === 'JSON' ? 'json' : cliOptions.output;

      // Run evaluations via orchestrator
      const result = await evaluateFiles(targets, {
        prompts,
        rulesPath,
        provider,
        ...(searchProvider ? { searchProvider } : {}),
        concurrency: config.concurrency,
        verbose: cliOptions.verbose,
        outputFormat: outputFormat,
        scanPaths: config.scanPaths,
      });

      // Print global summary (only for line format)
      if (cliOptions.output === 'line') {
        printGlobalSummary(
          result.totalFiles,
          result.totalErrors,
          result.totalWarnings,
          result.requestFailures
        );
      }

      // Exit with appropriate code
      process.exit(result.hadOperationalErrors || result.hadSeverityErrors ? 1 : 0);
    });
}
