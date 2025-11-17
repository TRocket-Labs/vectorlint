import type { Command } from 'commander';
import { ValeRunner } from '../evaluators/vale-ai/vale-runner';
import { ValeAIEvaluator } from '../evaluators/vale-ai/vale-ai-evaluator';
import { SuggestionGenerator } from '../evaluators/vale-ai/suggestion-generator';
import { createProvider } from '../providers/provider-factory';
import { DefaultRequestBuilder } from '../providers/request-builder';
import { loadDirective } from '../prompts/directive-loader';
import { parseCliOptions, parseEnvironment } from '../boundaries/index';
import { handleUnknownError } from '../errors/index';
import type { ValeAIConfig } from '../evaluators/vale-ai/types';

/*
 * Registers the 'vale-ai' command with Commander.
 * This command runs Vale CLI with AI-enhanced suggestions for writing improvements.
 */
export function registerValeAICommand(program: Command): void {
  program
    .command('vale-ai [files...]')
    .description('Run Vale with AI-enhanced suggestions')
    .option('-v, --verbose', 'Enable verbose logging')
    .option('--context-window <size>', 'Number of characters to extract before/after each issue for AI context', '100')
    .action(async (files: string[] = [], rawOpts: unknown) => {
      // Parse and validate CLI options
      let cliOptions;
      try {
        cliOptions = parseCliOptions(rawOpts);
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

      // Parse context window size
      const contextWindowSize = parseInt((rawOpts as any)?.contextWindow || '100', 10);
      if (isNaN(contextWindowSize) || contextWindowSize < 0) {
        console.error('Error: context-window must be a non-negative number');
        process.exit(1);
      }

      // Create Vale runner and check installation
      const valeRunner = new ValeRunner();
      if (!valeRunner.isInstalled()) {
        console.error('Error: Vale is not installed or not in PATH.');
        console.error('Install Vale: https://vale.sh/docs/vale-cli/installation/');
        process.exit(1);
      }

      if (cliOptions.verbose) {
        const version = await valeRunner.getVersion();
        console.log(`[vale-ai] Using Vale version: ${version || 'unknown'}`);
      }

      // Load directive and create LLM provider
      let directive;
      try {
        directive = loadDirective();
      } catch (e: unknown) {
        const err = handleUnknownError(e, 'Loading directive');
        console.error(`Error: ${err.message}`);
        process.exit(1);
      }
      
      const llmProvider = createProvider(
        env,
        {
          debug: cliOptions.verbose,
          showPrompt: false, // Vale AI uses its own prompts
          showPromptTrunc: false,
          debugJson: false,
        },
        new DefaultRequestBuilder(directive)
      );

      // Create Vale AI evaluator
      const config: ValeAIConfig = {
        contextWindowSize
      };

      const evaluator = new ValeAIEvaluator(
        llmProvider,
        valeRunner,
        config
      );

      try {
        if (cliOptions.verbose) {
          console.log(`[vale-ai] Running Vale on ${files.length > 0 ? files.join(', ') : 'all files'}`);
        }

        // Run evaluation
        const result = await evaluator.evaluate(files.length > 0 ? files : undefined);

        // Display results
        if (result.findings.length === 0) {
          console.log('✓ No issues found by Vale.');
          process.exit(0);
        }

        console.log(`Found ${result.findings.length} issue(s):\n`);

        for (const finding of result.findings) {
          const severityIcon = finding.severity === 'error' ? '✖' : 
                              finding.severity === 'warning' ? '⚠' : 'ℹ';
          
          console.log(`${severityIcon} ${finding.file}:${finding.line}:${finding.column}`);
          console.log(`  Rule: ${finding.rule}`);
          console.log(`  Match: "${finding.match}"`);
          console.log(`  Suggestion: ${finding.suggestion}`);
          
          if (cliOptions.verbose && finding.context) {
            const contextPreview = `${finding.context.before}${finding.match}${finding.context.after}`;
            console.log(`  Context: "${contextPreview.substring(0, 100)}${contextPreview.length > 100 ? '...' : ''}"`);
          }
          
          console.log('');
        }

        // Exit with error code if any errors found
        const hasErrors = result.findings.some(f => f.severity === 'error');
        process.exit(hasErrors ? 1 : 0);

      } catch (error) {
        const err = handleUnknownError(error, 'Running Vale AI evaluation');
        console.error(`Error: ${err.message}`);
        process.exit(1);
      }
    });
}