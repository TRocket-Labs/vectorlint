import type { Command } from 'commander';
import { ValeRunner } from '../evaluators/vale-ai/vale-runner';
import { ValeAIEvaluator } from '../evaluators/vale-ai/vale-ai-evaluator';
import { createProvider } from '../providers/provider-factory';
import { DefaultRequestBuilder } from '../providers/request-builder';
import { loadDirective } from '../prompts/directive-loader';
import { parseCliOptions, parseEnvironment } from '../boundaries';
import { handleUnknownError } from '../errors';
import { printValeIssueRow, printValeFileSummary, printValeGlobalSummary } from '../output/reporter';
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

function displayResults(findings: ValeFinding[]): void {
  if (findings.length === 0) {
    console.log('✓ No issues found by Vale.');
    return;
  }

  const findingsByFile = new Map<string, ValeFinding[]>();
  for (const finding of findings) {
    const fileFindings = findingsByFile.get(finding.file) || [];
    fileFindings.push(finding);
    findingsByFile.set(finding.file, fileFindings);
  }

  // Display results in Vale's tabular format
  for (const [file, fileFindings] of findingsByFile) {
    console.log(file);
    
    for (const finding of fileFindings) {
      const location = `${finding.line}:${finding.column}`;
      printValeIssueRow(
        location,
        finding.severity,
        finding.rule,
        finding.description,
        finding.suggestion
      );
    }

    // File summary
    const errors = fileFindings.filter(f => f.severity === 'error').length;
    const warnings = fileFindings.filter(f => f.severity === 'warning').length;
    const suggestions = fileFindings.filter(f => f.severity === 'suggestion').length;
    
    printValeFileSummary(errors, warnings, suggestions);
    console.log('');
  }

  // Global summary
  const totalErrors = findings.filter(f => f.severity === 'error').length;
  const totalWarnings = findings.filter(f => f.severity === 'warning').length;
  const totalSuggestions = findings.filter(f => f.severity === 'suggestion').length;
  
  printValeGlobalSummary(findingsByFile.size, totalErrors, totalWarnings, totalSuggestions);
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
    displayResults(result.findings);

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
