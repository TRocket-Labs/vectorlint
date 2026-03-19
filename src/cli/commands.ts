import type { Command } from 'commander';
import { existsSync } from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { createProvider } from '../providers/provider-factory';
import { PerplexitySearchProvider } from '../providers/perplexity-provider';
import type { SearchProvider } from '../providers/search-provider';
import { loadConfig } from '../boundaries/config-loader';
import { loadUserInstructions } from '../boundaries/user-instruction-loader';
import { loadRuleFile, type PromptFile } from '../prompts/prompt-loader';
import { RulePackLoader } from '../boundaries/rule-pack-loader';
import { PresetLoader } from '../config/preset-loader';
import { printGlobalSummary, printTokenUsage } from '../output/reporter';
import { DefaultRequestBuilder } from '../providers/request-builder';
import { loadDirective } from '../prompts/directive-loader';
import { resolveTargets } from '../scan/file-resolver';
import { parseCliOptions, parseEnvironment } from '../boundaries/index';
import { handleUnknownError } from '../errors/index';
import { evaluateFiles } from './orchestrator';
import { OutputFormat } from './types';
import { DEFAULT_CONFIG_FILENAME, USER_INSTRUCTION_FILENAME } from '../config/constants';

// eslint-disable-next-line @typescript-eslint/naming-convention
const __filename = fileURLToPath(import.meta.url);
// eslint-disable-next-line @typescript-eslint/naming-convention
const __dirname = dirname(__filename);

/**
 * Resolves the presets directory for both dev and built modes.
 * - Built mode: __dirname is `dist/`, so `../presets` resolves to project root `presets/`
 * - Dev mode: __dirname is `src/cli/`, so `../../presets` resolves to project root `presets/`
 */
function resolvePresetsDir(dir: string): string {
  const buildPath = path.resolve(dir, '../presets');
  if (existsSync(path.join(buildPath, 'meta.json'))) {
    return buildPath;
  }
  // Dev mode fallback: src/cli/ → ../../presets
  const devPath = path.resolve(dir, '../../presets');
  if (existsSync(path.join(devPath, 'meta.json'))) {
    return devPath;
  }

  throw new Error(`Could not locate presets directory containing meta.json. Looked in ${buildPath} and ${devPath}`);
}

/*
 * Registers the main evaluation command with Commander.
 * This is the default command that runs content evaluations against target files.
 */
export function registerMainCommand(program: Command): void {
  program
    .option('-v, --verbose', 'Enable verbose logging')
    .option('--show-prompt', 'Print full prompt and injected content')
    .option('--show-prompt-trunc', 'Print truncated prompt/content previews (500 chars)')
    .option('--debug-json', 'Write debug JSON artifacts (raw model output + filter decisions)')
    .option('--output <format>', 'Output format: line (default), json, or vale-json, rdjson', 'line')
    .option('--mode <mode>', 'Evaluation mode: lint (default) or agent', 'lint')
    .option('--config <path>', `Path to custom ${DEFAULT_CONFIG_FILENAME} config file`)
    .argument('[paths...]', 'files or directories to check (required)')
    .action(async (paths: string[] = []) => {
      // Require explicit paths to prevent accidental full directory scans
      // Users must provide specific files, directories, or wildcards (e.g., `vectorlint *`)
      if (paths.length === 0) {
        program.help();
        return;
      }

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

      // Load user instructions (VECTORLINT.md)
      const userInstructions = loadUserInstructions(process.cwd());
      if (userInstructions.content && cliOptions.verbose) {
        console.log(`[vectorlint] Loaded user instructions from ${USER_INSTRUCTION_FILENAME} (${userInstructions.tokenEstimate} estimated tokens)`);
      }

      const provider = createProvider(
        env,
        {
          debug: cliOptions.verbose,
          showPrompt: cliOptions.showPrompt,
          showPromptTrunc: cliOptions.showPromptTrunc,
        },
        new DefaultRequestBuilder(directive, userInstructions.content || undefined)
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
      // Only check existence if rulesPath was provided
      if (rulesPath && !existsSync(rulesPath)) {
        console.error(`Error: rules path does not exist: ${rulesPath}`);
        process.exit(1);
      }

      const prompts: PromptFile[] = [];
      try {
        const presetsDir = resolvePresetsDir(__dirname);
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

      const outputFormat = cliOptions.output as OutputFormat;
      if (!Object.values(OutputFormat).includes(outputFormat)) {
        console.error(`Error: Invalid output format '${cliOptions.output}'. Valid options: line, json, vale-json, rdjson`);
        process.exit(1);
      }

      // Run evaluations via orchestrator
      const result = await evaluateFiles(targets, {
        mode: cliOptions.mode,
        prompts,
        rulesPath,
        provider,
        ...(searchProvider ? { searchProvider } : {}),
        concurrency: config.concurrency,
        verbose: cliOptions.verbose,
        debugJson: cliOptions.debugJson,
        outputFormat: outputFormat,
        scanPaths: config.scanPaths,
        pricing: {
          inputPricePerMillion: env.INPUT_PRICE_PER_MILLION,
          outputPricePerMillion: env.OUTPUT_PRICE_PER_MILLION,
        },
        ...(userInstructions.content ? { userInstructionContent: userInstructions.content } : {}),
      });

      // Print global summary (only for line format)
      if (cliOptions.output === 'line') {
        if (result.tokenUsage) {
          printTokenUsage(result.tokenUsage);
        }
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
