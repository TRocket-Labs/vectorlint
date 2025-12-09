import type { Command } from 'commander';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import * as path from 'path';
import { StyleGuideProcessor } from '../style-guide/style-guide-processor';
import { createProvider } from '../providers/provider-factory';
import { DefaultRequestBuilder } from '../providers/request-builder';
import { loadDirective } from '../prompts/directive-loader';
import { parseEnvironment, parseConvertOptions } from '../boundaries/index';
import { loadConfig } from '../boundaries/config-loader';
import { handleUnknownError } from '../errors/index';
import { ConvertOptions } from '../schemas';

/**
 * Custom error class for convert command failures.
 * Includes exit code for CLI handling.
 */
class ConvertCommandError extends Error {
    constructor(message: string, public readonly exitCode: number = 1) {
        super(message);
        this.name = 'ConvertCommandError';
    }
}

export function registerConvertCommand(program: Command): void {
    program
        .command('convert')
        .description('Convert a style guide into VectorLint evaluation prompts')
        .argument('<style-guide-path>', 'Path to the style guide file')
        .option('-o, --output <dir>', 'Output directory for generated rules (defaults to RulesPath from config)')
        .option('-f, --format <format>', 'Input format: markdown, auto', 'auto')
        .option('-t, --template <dir>', 'Custom template directory')
        .option('--strictness <level>', 'Strictness level: lenient, standard, strict', 'standard')
        .option('--severity <level>', 'Default severity: error, warning', 'warning')
        .option('--max-categories <number>', 'Limit to N most important categories (default: 10)', '10')
        .option('--rule <name>', 'Generate only rule matching this name/keyword')
        .option('--force', 'Overwrite existing files', false)
        .option('--dry-run', 'Preview generated rules without writing files', false)
        .option('-v, --verbose', 'Enable verbose logging', false)
        .action(async (styleGuidePath: string, rawOptions: unknown) => {
            try {
                await executeConvert(styleGuidePath, rawOptions);
            } catch (e: unknown) {
                if (e instanceof ConvertCommandError) {
                    console.error(`Error: ${e.message}`);
                    // Re-throw to let Commander handle the exit
                    throw e;
                }
                throw e;
            }
        });
}

async function executeConvert(styleGuidePath: string, rawOptions: unknown): Promise<void> {
    // 1. Parse CLI options
    let options: ConvertOptions;
    try {
        options = parseConvertOptions(rawOptions);
    } catch (e: unknown) {
        const err = handleUnknownError(e, 'Parsing CLI options');
        throw new ConvertCommandError(err.message);
    }

    // 2. Validate input file
    if (!existsSync(styleGuidePath)) {
        throw new ConvertCommandError(`Style guide file not found: ${styleGuidePath}`);
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
            throw new ConvertCommandError('Please either use -o/--output or create a valid vectorlint.ini.');
        }
        const err = handleUnknownError(e, 'Loading configuration');
        throw new ConvertCommandError(err.message);
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
        console.error('Please set these in your .env file or environment.');
        throw new ConvertCommandError(err.message);
    }

    // 5. Load Directive & Initialize Provider
    const directive = loadDirective();
    const provider = createProvider(
        env,
        { debug: options.verbose },
        new DefaultRequestBuilder(directive)
    );

    // 6. Process Style Guide
    if (options.verbose) {
        console.log(`[vectorlint] Processing style guide...`);
        console.log(`[vectorlint] Using ${env.LLM_PROVIDER}...`);
    }

    const processor = new StyleGuideProcessor({
        llmProvider: provider,
        maxCategories: options.maxCategories ? parseInt(options.maxCategories) : 10,
        filterRule: options.rule,
        templateDir: options.template || undefined,
        defaultSeverity: options.severity,
        strictness: options.strictness,
        verbose: options.verbose,
    });

    const categoryRules = await processor.processFile(styleGuidePath);
    const rules = categoryRules.map(e => ({ filename: e.filename, content: e.content }));

    if (rules.length === 0) {
        console.warn('[vectorlint] No rules were generated. Check your style guide format.');
        return; // Exit gracefully with success since no error occurred
    }

    // 7. Write Output
    if (options.dryRun) {
        console.log('\n--- DRY RUN PREVIEW ---\n');
        for (const rule of rules) {
            console.log(`File: ${rule.filename}`);
            console.log('---');
            console.log(rule.content);
            console.log('---\n');
        }
        console.log(`[vectorlint] Would generate ${rules.length} files in ${outputDir}`);
    } else {
        if (!existsSync(outputDir)) {
            mkdirSync(outputDir, { recursive: true });
        }

        let writtenCount = 0;
        let skippedCount = 0;

        for (const rule of rules) {
            const filePath = path.join(outputDir, rule.filename);

            if (existsSync(filePath) && !options.force) {
                if (options.verbose) {
                    console.warn(`[vectorlint] Skipping existing file: ${filePath} (use --force to overwrite)`);
                }
                skippedCount++;
                continue;
            }

            writeFileSync(filePath, rule.content, 'utf-8');
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
}
