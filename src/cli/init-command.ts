import type { Command } from 'commander';
import { existsSync, writeFileSync } from 'fs';
import * as path from 'path';
import { DEFAULT_CONFIG_FILENAME } from '../config/constants';
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

interface InitOptions {
    force?: boolean;
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
        .action((opts: InitOptions) => {
            const cwd = process.cwd();
            const configPath = path.join(cwd, DEFAULT_CONFIG_FILENAME);

            const configExists = existsSync(configPath);

            // Check for existing files without --force
            if (configExists && !opts.force) {
                console.error(`Error: The following files already exist:`);
                console.error(`  • ${DEFAULT_CONFIG_FILENAME}`);
                console.error(`\nUse --force to overwrite existing files.`);
                process.exit(1);
            }

            // Write configuration files
            try {
                // 1. Create Project Config
                writeFileSync(configPath, CONFIG_TEMPLATE, 'utf-8');

                // 2. Ensure Global Config
                const globalPath = ensureGlobalConfig();

                console.log(`✓ Configuration files created successfully!\n`);
                console.log(`VectorLint Config: ${path.relative(cwd, configPath)}`);
                console.log(`App Config:        ${globalPath}\n`);

            } catch (e: unknown) {
                const err = e instanceof Error ? e : new Error(String(e));
                console.error(`Error: Failed to write configuration files: ${err.message}`);
                process.exit(1);
            }

            // Print success message with next steps
            console.log(`Next steps:`);
            console.log(`  1. Edit ${DEFAULT_CONFIG_FILENAME} and set RulesPath to your rules directory`);
            console.log(`  2. Open ${getGlobalConfigPath()} to configure your API keys (e.g., OPENAI_API_KEY)`);
            console.log(`  3. Run 'vectorlint' to start linting your content`);
        });
}
