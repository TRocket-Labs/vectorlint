import type { Command } from 'commander';
import { existsSync, writeFileSync } from 'fs';
import * as path from 'path';
import { DEFAULT_CONFIG_FILENAME } from '../config/constants';

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

// Template for .env.vectorlint environment file
const ENV_TEMPLATE = `# VectorLint Environment Configuration
# This file contains API keys and provider settings.
# 
# SETUP INSTRUCTIONS:
# 1. Rename this file to .env, OR
# 2. Copy its contents into your existing .env file
# 3. Uncomment and configure your preferred LLM provider below

# ============================================
# LLM Provider Configuration
# Choose ONE provider by uncommenting its section
# ============================================

# --- Option 1: Azure OpenAI ---
# LLM_PROVIDER=azure-openai
# AZURE_OPENAI_API_KEY=your-api-key-here
# AZURE_OPENAI_ENDPOINT=https://your-resource-name.openai.azure.com
# AZURE_OPENAI_DEPLOYMENT_NAME=your-deployment-name
# AZURE_OPENAI_API_VERSION=2024-02-15-preview
# AZURE_OPENAI_TEMPERATURE=0.2

# --- Option 2: Anthropic Claude ---
# LLM_PROVIDER=anthropic
# ANTHROPIC_API_KEY=your-anthropic-api-key-here
# ANTHROPIC_MODEL=claude-sonnet-4-20250514
# ANTHROPIC_MAX_TOKENS=4096
# ANTHROPIC_TEMPERATURE=0.2

# ============================================
# Search Provider Configuration (Optional)
# Enables technical accuracy verification
# ============================================

# SEARCH_PROVIDER=perplexity
# PERPLEXITY_API_KEY=pplx-0000000000000000
`;

const ENV_FILENAME = '.env.vectorlint';

interface InitOptions {
    force?: boolean;
}

/**
 * Registers the 'init' command with Commander.
 * This command initializes VectorLint configuration files in the current directory.
 */
export function registerInitCommand(program: Command): void {
    program
        .command('init')
        .description('Initialize VectorLint configuration files')
        .option('--force', 'Overwrite existing configuration files')
        .action((opts: InitOptions) => {
            const cwd = process.cwd();
            const configPath = path.join(cwd, DEFAULT_CONFIG_FILENAME);
            const envPath = path.join(cwd, ENV_FILENAME);

            const configExists = existsSync(configPath);
            const envExists = existsSync(envPath);

            // Check for existing files without --force
            if (!opts.force) {
                const existingFiles: string[] = [];
                if (configExists) existingFiles.push(DEFAULT_CONFIG_FILENAME);
                if (envExists) existingFiles.push(ENV_FILENAME);

                if (existingFiles.length > 0) {
                    console.error(`Error: The following files already exist:`);
                    for (const file of existingFiles) {
                        console.error(`  • ${file}`);
                    }
                    console.error(`\nUse --force to overwrite existing files.`);
                    process.exit(1);
                }
            }

            // Write configuration files
            try {
                writeFileSync(configPath, CONFIG_TEMPLATE, 'utf-8');
                writeFileSync(envPath, ENV_TEMPLATE, 'utf-8');
            } catch (e: unknown) {
                const err = e instanceof Error ? e : new Error(String(e));
                console.error(`Error: Failed to write configuration files: ${err.message}`);
                process.exit(1);
            }

            // Print success message with next steps
            console.log(`✓ Configuration files created successfully!\n`);
            console.log(`Next steps:`);
            console.log(`  1. Edit ${DEFAULT_CONFIG_FILENAME} and set RulesPath to your rules directory`);
            console.log(`  2. Set up your LLM provider:`);
            console.log(`     • Rename ${ENV_FILENAME} to .env, OR`);
            console.log(`     • Copy its contents into your existing .env file`);
            console.log(`  3. Uncomment and configure your preferred provider's API keys`);
            console.log(`  4. Run 'vectorlint' to start linting your content`);
        });
}
