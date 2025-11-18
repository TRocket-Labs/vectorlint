import type { Command } from 'commander';
import { ValeRunner } from '../evaluators/vale-ai/vale-runner';
import { ValeAIEvaluator } from '../evaluators/vale-ai/vale-ai-evaluator';
import { createProvider } from '../providers/provider-factory';
import { DefaultRequestBuilder } from '../providers/request-builder';
import { loadDirective } from '../prompts/directive-loader';
import { parseCliOptions, parseEnvironment } from '../boundaries';
import { handleUnknownError } from '../errors';
import type { ValeAIConfig, ValeFinding } from '../evaluators/vale-ai/types';
import type { CliOptions } from '../schemas/cli-schemas';
import type { EnvConfig } from '../schemas/env-schemas';

const VALE_NOT_INSTALLED_ERROR = 'Vale is not installed or not in PATH';
const VALE_INSTALLATION_URL = 'Install Vale: https://vale.sh/docs/vale-cli/installation/';

function parseAndValidateCliOptions(rawOpts: unknown): CliOptions {
  try {
    return parseCliOptions(rawOpts);
  } catch (e: unknown) {
    const err = handleUnknownError(e, 'Parsing CLI options');
    console.error(`Error: ${err.message}`);
    throw new Error(`CLI options parsing failed: ${err.message}`);
  }
}

function parseAndValidateEnvironment(): EnvConfig {
  try {
    return parseEnvironment();
  } catch (e: unknown) {
    const err = handleUnknownError(e, 'Validating environment variables');
    console.error(`Error: ${err.message}`);
    console.error('Please set these in your .env file or environment.');
    throw new Error(`Environment validation failed: ${err.message}`);
  }
}

function parseContextCharsSize(rawOpts: unknown): number {
  const rawContextChars = (rawOpts as Record<string, unknown>)?.contextChars;
  const contextCharsStr = typeof rawContextChars === 'string' ? rawContextChars : '100';
  const contextCharsSize = parseInt(contextCharsStr, 10);
  
  if (isNaN(contextCharsSize) || contextCharsSize < 0) {
    console.error('Error: context-chars must be a non-negative number');
    throw new Error('Invalid context-chars value');
  }
  
  return contextCharsSize;
}

async function createAndValidateValeRunner(verbose: boolean): Promise<ValeRunner> {
  const valeRunner = new ValeRunner();
  
  if (!valeRunner.isInstalled()) {
    console.error(`Error: ${VALE_NOT_INSTALLED_ERROR}.`);
    console.error(VALE_INSTALLATION_URL);
    throw new Error(VALE_NOT_INSTALLED_ERROR);
  }

  if (verbose) {
    const version = await valeRunner.getVersion();
    console.log(`[vale-ai] Using Vale version: ${version || 'unknown'}`);
  }

  return valeRunner;
}

function createLLMProvider(env: EnvConfig, verbose: boolean) {
  let directive;
  try {
    directive = loadDirective();
  } catch (e: unknown) {
    const err = handleUnknownError(e, 'Loading directive');
    console.error(`Error: ${err.message}`);
    throw new Error(`Directive loading failed: ${err.message}`);
  }
  
  return createProvider(
    env,
    {
      debug: verbose,
      showPrompt: false, // Vale AI uses its own prompts
      showPromptTrunc: false,
      debugJson: false,
    },
    new DefaultRequestBuilder(directive)
  );
}

function displayResults(findings: ValeFinding[], verbose: boolean): void {
  if (findings.length === 0) {
    console.log('✓ No issues found by Vale.');
    return;
  }

  console.log(`Found ${findings.length} issue(s):\n`);

  for (const finding of findings) {
    const severityIcon = finding.severity === 'error' ? '✖' : 
                        finding.severity === 'warning' ? '⚠' : 'ℹ';
    
    console.log(`${severityIcon} ${finding.file}:${finding.line}:${finding.column}`);
    console.log(`  Rule: ${finding.rule}`);
    console.log(`  Match: "${finding.match}"`);
    console.log(`  Suggestion: ${finding.suggestion}`);
    
    if (verbose && finding.context) {
      const contextPreview = `${finding.context.before}${finding.match}${finding.context.after}`;
      console.log(`  Context: "${contextPreview.substring(0, 100)}${contextPreview.length > 100 ? '...' : ''}"`);
    }
    
    console.log('');
  }
}

async function executeValeAIEvaluation(
  files: string[],
  cliOptions: CliOptions,
  env: EnvConfig,
  contextCharsSize: number
): Promise<void> {
  const valeRunner = await createAndValidateValeRunner(cliOptions.verbose);
  const llmProvider = createLLMProvider(env, cliOptions.verbose);

  const config: ValeAIConfig = {
    contextWindowSize: contextCharsSize
  };

  const evaluator = new ValeAIEvaluator(llmProvider, valeRunner, config);

  try {
    if (cliOptions.verbose) {
      console.log(`[vale-ai] Running Vale on ${files.length > 0 ? files.join(', ') : 'all files'}`);
    }

    const result = await evaluator.evaluate(files.length > 0 ? files : undefined);
    displayResults(result.findings, cliOptions.verbose);

    // Note: We don't throw errors for Vale findings as they are suggestions/warnings
    // The command completes successfully after displaying the results
  } catch (error) {
    const err = handleUnknownError(error, 'Running Vale AI evaluation');
    console.error(`Error: ${err.message}`);
    // eslint-disable-next-line n/no-process-exit
    process.exit(1);
  }
}

/**
 * Registers the 'vale-ai' command with Commander.
 * This command runs Vale CLI with AI-enhanced suggestions for writing improvements.
 */
export function registerValeAICommand(program: Command): void {
  program
    .command('vale-ai [files...]')
    .description('Run Vale with AI-enhanced suggestions')
    .option('-v, --verbose', 'Enable verbose logging')
    .option('--context-chars <size>', 'Number of characters to extract before/after each issue for AI context', '100')
    .action(async (files: string[] = [], rawOpts: unknown) => {
      const cliOptions = parseAndValidateCliOptions(rawOpts);
      const env = parseAndValidateEnvironment();
      const contextCharsSize = parseContextCharsSize(rawOpts);

      await executeValeAIEvaluation(files, cliOptions, env, contextCharsSize);
    });
}
