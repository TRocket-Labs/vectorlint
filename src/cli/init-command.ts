import type { Command } from 'commander';
import { existsSync, writeFileSync } from 'fs';
import * as path from 'path';
import { DEFAULT_CONFIG_FILENAME, STYLE_GUIDE_FILENAME } from '../config/constants';
import { ensureGlobalConfig, getGlobalConfigPath } from '../config/global-config';

// Template for .vectorlint.ini configuration file
const CONFIG_TEMPLATE = `# VectorLint Configuration
# Global settings
RulesPath=
Concurrency=4
DefaultSeverity=warning

# Default rules for all markdown files
[**/*.md]
RunRules=VectorLint
`;

// Template for VECTORLINT.md style guide
const STYLE_GUIDE_TEMPLATE = `# Style Guide

<!--
VectorLint will use these instructions when evaluating your content.
Add your style preferences, terminology guidelines, tone requirements, etc.
-->

## Writing Style

- Use clear, direct language
- Prefer active voice over passive voice
- Keep sentences concise

## Terminology

<!-- Define preferred terms and terms to avoid -->
| Preferred | Avoid |
|-----------|-------|
| use | utilize |
| help | assist |

## Tone

- Professional but approachable
- Avoid jargon unless necessary
`;

interface InitOptions {
    force?: boolean;
    quick?: boolean;
    full?: boolean;
}

/**
 * Registers the 'init' command with Commander.
 * This command initializes VectorLint configuration files in the current directory
 * AND ensures the global configuration exists.
 */
export function registerInitCommand(program: Command): void {
    program
        .command('init')
        .description('Initialize VectorLint configuration files')
        .option('--force', 'Overwrite existing configuration files')
        .option('--quick', `Create only ${STYLE_GUIDE_FILENAME} for zero-config usage`)
        .option('--full', `Create both ${DEFAULT_CONFIG_FILENAME} and ${STYLE_GUIDE_FILENAME}`)
        .action((opts: InitOptions) => {
            const cwd = process.cwd();
            const configPath = path.join(cwd, DEFAULT_CONFIG_FILENAME);
            const styleGuidePath = path.join(cwd, STYLE_GUIDE_FILENAME);

            const createStyleGuide = opts.quick || opts.full;
            const createConfig = !opts.quick || opts.full;

            const configExists = existsSync(configPath);
            const styleGuideExists = existsSync(styleGuidePath);

            // Check for existing files without --force
            if (!opts.force) {
                const existingFiles: string[] = [];
                if (createConfig && configExists) existingFiles.push(DEFAULT_CONFIG_FILENAME);
                if (createStyleGuide && styleGuideExists) existingFiles.push(STYLE_GUIDE_FILENAME);

                if (existingFiles.length > 0) {
                    console.error(`Error: The following files already exist:`);
                    existingFiles.forEach(f => console.error(`  • ${f}`));
                    console.error(`\nUse --force to overwrite existing files.`);
                    process.exit(1);
                }
            }

            // Write configuration files
            try {
                // 1. Create Project Config
                if (createConfig) {
                    writeFileSync(configPath, CONFIG_TEMPLATE, 'utf-8');
                }

                // 2. Create Style Guide
                if (createStyleGuide) {
                    writeFileSync(styleGuidePath, STYLE_GUIDE_TEMPLATE, 'utf-8');
                }

                // 3. Ensure Global Config
                const globalPath = ensureGlobalConfig();

                console.log(`✓ Configuration files created successfully!\n`);
                if (createConfig) console.log(`VectorLint Config: ${path.relative(cwd, configPath)}`);
                if (createStyleGuide) console.log(`Style Guide:       ${path.relative(cwd, styleGuidePath)}`);
                console.log(`App Config:        ${globalPath}\n`);

            } catch (e: unknown) {
                const err = e instanceof Error ? e : new Error(String(e));
                console.error(`Error: Failed to write configuration files: ${err.message}`);
                process.exit(1);
            }

            // Print success message with next steps
            console.log(`Next steps:`);
            console.log(`  1. Open ${getGlobalConfigPath()} and configure your API keys (e.g., OPENAI_API_KEY)`);
            if (createStyleGuide) {
                console.log(`  2. Edit ${STYLE_GUIDE_FILENAME} to define your specific style rules`);
            }
            console.log(`  ${createStyleGuide ? '3' : '2'}. Run 'vectorlint <file.md>' to start linting your content`);
            if (createConfig) {
                console.log(`  ${createStyleGuide ? '4' : '3'}. (Optional) Edit ${DEFAULT_CONFIG_FILENAME} to add custom rules or configure strictness`);
            }
        });
}
