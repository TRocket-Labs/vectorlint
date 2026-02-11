import type { Command } from 'commander';
import { existsSync, writeFileSync } from 'fs';
import * as path from 'path';
import { DEFAULT_CONFIG_FILENAME, USER_INSTRUCTION_FILENAME } from '../config/constants';
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

// Template for VECTORLINT.md user instructions
const USER_INSTRUCTION_TEMPLATE = `# User Instructions

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
        .option('--quick', `Create only ${USER_INSTRUCTION_FILENAME} for zero-config usage`)
        .option('--full', `Create both ${DEFAULT_CONFIG_FILENAME} and ${USER_INSTRUCTION_FILENAME}`)
        .action((opts: InitOptions) => {
            const cwd = process.cwd();
            const configPath = path.join(cwd, DEFAULT_CONFIG_FILENAME);
            const userInstructionPath = path.join(cwd, USER_INSTRUCTION_FILENAME);

            const createUserInstructions = opts.quick || opts.full;
            const createConfig = !opts.quick || opts.full;

            const configExists = existsSync(configPath);
            const userInstructionExists = existsSync(userInstructionPath);

            // Check for existing files without --force
            if (!opts.force) {
                const existingFiles: string[] = [];
                if (createConfig && configExists) existingFiles.push(DEFAULT_CONFIG_FILENAME);
                if (createUserInstructions && userInstructionExists) existingFiles.push(USER_INSTRUCTION_FILENAME);

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

                // 2. Create User Instructions
                if (createUserInstructions) {
                    writeFileSync(userInstructionPath, USER_INSTRUCTION_TEMPLATE, 'utf-8');
                }

                // 3. Ensure Global Config
                const globalPath = ensureGlobalConfig();

                console.log(`✓ Configuration files created successfully!\n`);
                if (createConfig) console.log(`VectorLint Config: ${path.relative(cwd, configPath)}`);
                if (createUserInstructions) console.log(`User Instructions: ${path.relative(cwd, userInstructionPath)}`);
                console.log(`App Config:        ${globalPath}\n`);

            } catch (e: unknown) {
                const err = e instanceof Error ? e : new Error(String(e));
                console.error(`Error: Failed to write configuration files: ${err.message}`);
                process.exit(1);
            }

            // Print success message with next steps
            console.log(`Next steps:`);
            console.log(`  1. Open ${getGlobalConfigPath()} and configure your API keys (e.g., OPENAI_API_KEY)`);
            if (createUserInstructions) {
                console.log(`  2. Edit ${USER_INSTRUCTION_FILENAME} to define your instructions for content evaluation`);
            }
            console.log(`  ${createUserInstructions ? '3' : '2'}. Run 'vectorlint <file.md>' to start linting your content`);
            if (createConfig) {
                console.log(`  ${createUserInstructions ? '4' : '3'}. (Optional) Edit ${DEFAULT_CONFIG_FILENAME} to add custom rules or configure strictness`);
            }
        });
}
