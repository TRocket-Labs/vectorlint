import type { Command } from 'commander';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import * as path from 'path';
import { StyleGuideParser } from '../style-guide/style-guide-parser';
import { EvalGenerator } from '../style-guide/eval-generator';
import { StyleGuideProcessor } from '../style-guide/style-guide-processor';
import { createProvider } from '../providers/provider-factory';
import { DefaultRequestBuilder } from '../providers/request-builder';
import { loadDirective } from '../prompts/directive-loader';
import { parseEnvironment } from '../boundaries/index';
import { loadConfig } from '../boundaries/config-loader';
import { handleUnknownError } from '../errors/index';
import { StyleGuideFormat } from '../style-guide/types';

interface ConvertOptions {
    output: string;
    format: string;
    template?: string;
    strictness: 'lenient' | 'standard' | 'strict';
    severity: 'error' | 'warning';
    force: boolean;
    dryRun: boolean;
    verbose: boolean;
    groupByCategory: boolean;
    maxCategories?: string;
    rule?: string;
}

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
        .action(async (styleGuidePath: string, options: ConvertOptions) => {
            try {
                if (!existsSync(styleGuidePath)) {
                    console.error(`Error: Style guide file not found: ${styleGuidePath}`);
                    process.exit(1);
                }

                // Determine output directory: CLI option > config PromptsPath
                let outputDir = options.output;
                if (!outputDir) {
                    try {
                        const config = loadConfig();
                        outputDir = config.rulesPath;
                        if (options.verbose) {
                            console.log(`[vectorlint] Using RulesPath from config: ${outputDir}`);
                        }
                    } catch {
                        console.error('Error: No output directory specified and no vectorlint.ini found.');
                        console.error('Please either use -o/--output or create a vectorlint.ini with PromptsPath.');
                        process.exit(1);
                    }
                }

                if (options.verbose) {
                    console.log(`[vectorlint] Reading style guide from: ${styleGuidePath}`);
                    console.log(`[vectorlint] Output directory: ${outputDir}`);
                }

                // 1. Parse style guide
                const parser = new StyleGuideParser();
                const parseOptions = {
                    format: options.format === 'auto' ? StyleGuideFormat.AUTO : options.format as StyleGuideFormat,
                    verbose: options.verbose
                };

                const styleGuide = parser.parse(styleGuidePath, parseOptions);

                if (options.verbose) {
                    console.log(`[vectorlint] Parsed ${styleGuide.data.rules.length} rules from style guide`);
                }

                // 2. Initialize LLM provider
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

                const directive = loadDirective();
                const provider = createProvider(
                    env,
                    { debug: options.verbose },
                    new DefaultRequestBuilder(directive)
                );

                // 3. Generate evals
                if (options.verbose) {
                    console.log(`[vectorlint] Generating evals using ${env.LLM_PROVIDER}...`);
                    if (options.groupByCategory) {
                        console.log(`[vectorlint] Using category-based generation (max ${options.maxCategories || 10} categories)`);
                    }
                }

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
                    // Original rule-by-rule generation
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

                // 4. Write to files or preview
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
                    if (!existsSync(outputDir)) {
                        mkdirSync(outputDir, { recursive: true });
                    }

                    let writtenCount = 0;
                    let skippedCount = 0;

                    for (const eva of evals) {
                        const filePath = path.join(outputDir, eva.filename);

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

            } catch (error) {
                const err = handleUnknownError(error, 'Converting style guide');
                console.error(`Error: ${err.message}`);
                process.exit(1);
            }
        });
}
