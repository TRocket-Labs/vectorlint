import type { Command } from 'commander';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import * as path from 'path';
import { StyleGuideParser } from '../style-guide/style-guide-parser';
import { EvalGenerator } from '../style-guide/eval-generator';
import { StyleGuideProcessor } from '../style-guide/style-guide-processor';
import { createProvider } from '../providers/provider-factory';
import { DefaultRequestBuilder } from '../providers/request-builder';
import { loadDirective } from '../prompts/directive-loader';
import { parseEnvironment, parseConvertOptions } from '../boundaries/index';
import { loadConfig } from '../boundaries/config-loader';
import { handleUnknownError } from '../errors/index';
import { StyleGuideFormat } from '../style-guide/types';
import { ConvertOptions } from './types';

export function registerConvertCommand(program: Command): void {
    program
        .command('convert')
        .description('Convert a style guide into VectorLint evaluation prompts')
        .argument('<style-guide-path>', 'Path to the style guide file')
        .option('-o, --output <dir>', 'Output directory for generated evals (defaults to RulesPath from config)')
        .option('-f, --format <format>', 'Input format: markdown, auto', 'auto')
        .option('-t, --template <dir>', 'Custom template directory')
        .option('--strictness <level>', 'Strictness level: lenient, standard, strict', 'standard')
        .option('--severity <level>', 'Default severity: error, warning', 'warning')
        .option('--group-by-category', 'Group rules by category (recommended, reduces eval count)', true)
        .option('--max-categories <number>', 'Limit to N most important categories (default: 10)', '10')
        .option('--rule <name>', 'Generate only rule matching this name/keyword')
        .option('--force', 'Overwrite existing files', false)
        .option('--dry-run', 'Preview generated evals without writing files', false)
        .option('-v, --verbose', 'Enable verbose logging', false)
        .action(async (styleGuidePath: string, rawOptions: unknown) => {
            // 1. Parse CLI options
            let options: ConvertOptions;
            try {
                options = parseConvertOptions(rawOptions);
            } catch (e: unknown) {
                const err = handleUnknownError(e, 'Parsing CLI options');
                console.error(`Error: ${err.message}`);
                process.exit(1);
            }

            // 2. Validate input file
            if (!existsSync(styleGuidePath)) {
                console.error(`Error: Style guide file not found: ${styleGuidePath}`);
                process.exit(1);
            }

            // 3. Load configuration & determine output directory
            let config;
            let outputDir = options.output;

            try {
                // Determine output directory: CLI option > config RulesPath
                config = loadConfig(process.cwd());

                if (!outputDir) {
                    outputDir = config.rulesPath;
                    if (options.verbose) {
                        console.log(`[vectorlint] Using RulesPath from config: ${outputDir}`);
                    }
                }
            } catch (e: unknown) {
                if (!outputDir) {
                    const err = handleUnknownError(e, 'Loading configuration');
                    console.error('Error: No output directory specified and failed to load vectorlint.ini.');
                    console.error(`Details: ${err.message}`);
                    console.error('Please either use -o/--output or create a valid vectorlint.ini.');
                    process.exit(1);
                }
                const err = handleUnknownError(e, 'Loading configuration');
                console.error(`Error: ${err.message}`);
                process.exit(1);
            }

            if (options.verbose) {
                console.log(`[vectorlint] Reading style guide from: ${styleGuidePath}`);
                console.log(`[vectorlint] Output directory: ${outputDir}`);
            }

            // 4. Parse Environment
            let env;
            try {
                env = parseEnvironment();
            } catch (e: unknown) {
                const err = handleUnknownError(e, 'Validating environment variables');
                console.error(`Error: ${err.message}`);
                console.error('Please set these in your .env file or environment.');
                process.exit(1);
            }

            // 5. Load Directive & Initialize Provider
            try {
                const directive = loadDirective();
                const provider = createProvider(
                    env,
                    { debug: options.verbose },
                    new DefaultRequestBuilder(directive)
                );

                // 6. Parse Style Guide
                if (options.verbose) {
                    console.log(`[vectorlint] Parsing style guide...`);
                }
                const parser = new StyleGuideParser();
                const parseOptions = {
                    format: options.format === 'auto' ? StyleGuideFormat.AUTO : options.format as StyleGuideFormat,
                    verbose: options.verbose
                };
                const styleGuide = parser.parse(styleGuidePath, parseOptions);

                if (options.verbose) {
                    console.log(`[vectorlint] Parsed ${styleGuide.data.rules.length} rules from style guide`);
                    console.log(`[vectorlint] Generating evals using ${env.LLM_PROVIDER}...`);
                }

                // 7. Generate Evals
                let evals: Array<{ filename: string; content: string }> = [];

                if (options.groupByCategory) {
                    const processor = new StyleGuideProcessor({
                        llmProvider: provider,
                        maxCategories: options.maxCategories ? parseInt(options.maxCategories) : 10,
                        filterRule: options.rule,
                        templateDir: options.template || undefined,
                        defaultSeverity: options.severity,
                        strictness: options.strictness,
                        verbose: options.verbose,
                    });

                    const categoryEvals = await processor.process(styleGuide.data);
                    evals = categoryEvals.map(e => ({ filename: e.filename, content: e.content }));
                } else {
                    const generator = new EvalGenerator({
                        llmProvider: provider,
                        templateDir: options.template || undefined,
                        defaultSeverity: options.severity,
                        strictness: options.strictness,
                    });

                    const ruleEvals = await generator.generateEvalsFromStyleGuide(styleGuide.data);
                    evals = ruleEvals.map(e => ({ filename: e.filename, content: e.content }));
                }

                if (evals.length === 0) {
                    console.warn('[vectorlint] No evals were generated. Check your style guide format.');
                    process.exit(0);
                }

                // 8. Write Output
                if (options.dryRun) {
                    console.log('\n--- DRY RUN PREVIEW ---\n');
                    for (const eva of evals) {
                        console.log(`File: ${eva.filename}`);
                        console.log('---');
                        console.log(eva.content);
                        console.log('---\n');
                    }
                    console.log(`[vectorlint] Would generate ${evals.length} files in ${outputDir}`);
                } else {
                    if (!existsSync(outputDir!)) {
                        mkdirSync(outputDir!, { recursive: true });
                    }

                    let writtenCount = 0;
                    let skippedCount = 0;

                    for (const eva of evals) {
                        const filePath = path.join(outputDir!, eva.filename); // outputDir is guaranteed string here

                        if (existsSync(filePath) && !options.force) {
                            if (options.verbose) {
                                console.warn(`[vectorlint] Skipping existing file: ${filePath} (use --force to overwrite)`);
                            }
                            skippedCount++;
                            continue;
                        }

                        writeFileSync(filePath, eva.content, 'utf-8');
                        writtenCount++;
                        if (options.verbose) {
                            console.log(`[vectorlint] Wrote: ${filePath}`);
                        }
                    }

                    console.log(`\n[vectorlint] Successfully generated ${writtenCount} evaluation files.`);
                    if (skippedCount > 0) {
                        console.log(`[vectorlint] Skipped ${skippedCount} existing files.`);
                    }
                }

            } catch (e: unknown) {
                const err = handleUnknownError(e, 'Converting style guide');
                console.error(`Error: ${err.message}`);
                process.exit(1);
            }
        });
}
