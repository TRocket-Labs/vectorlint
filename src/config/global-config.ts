import { z } from 'zod';
import * as os from 'os';
import * as path from 'path';
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'fs';
import { parse } from 'smol-toml';
import { handleUnknownError } from '../errors/index';
import { GLOBAL_CONFIG_DIR, GLOBAL_CONFIG_FILE } from './constants';
import { GLOBAL_CONFIG_SCHEMA } from '../schemas';

export function getGlobalConfigPath(): string {
    return path.join(os.homedir(), GLOBAL_CONFIG_DIR, GLOBAL_CONFIG_FILE);
}

const DEFAULT_GLOBAL_CONFIG_TEMPLATE = `# VectorLint Environment Configuration
# This file contains API keys and provider settings.
# Keys defined here are available as environment variables.

[env]
# ============================================
# LLM Provider Configuration
# Choose ONE provider by uncommenting its section
# ============================================

# --- Option 1: OpenAI (Standard) ---
# LLM_PROVIDER = "openai"
# OPENAI_API_KEY = "sk-..."
# OPENAI_MODEL = "gpt-4o"
# OPENAI_TEMPERATURE = "0.2"

# --- Option 2: Azure OpenAI ---
# LLM_PROVIDER = "azure-openai"
# AZURE_OPENAI_API_KEY = "your-api-key-here"
# AZURE_OPENAI_ENDPOINT = "https://your-resource-name.openai.azure.com"
# AZURE_OPENAI_DEPLOYMENT_NAME = "your-deployment-name"
# AZURE_OPENAI_API_VERSION = "2024-02-15-preview"
# AZURE_OPENAI_TEMPERATURE = "0.2"

# --- Option 3: Anthropic Claude ---
# LLM_PROVIDER = "anthropic"
# ANTHROPIC_API_KEY = "your-anthropic-api-key-here"
# ANTHROPIC_MODEL = "claude-3-5-sonnet-20240620"
# ANTHROPIC_MAX_TOKENS = "4096"
# ANTHROPIC_TEMPERATURE = "0.2"

# --- Option 4: Google Gemini ---
# LLM_PROVIDER = "gemini"
# GEMINI_API_KEY = "your-gemini-api-key-here"
# GEMINI_MODEL = "gemini-2.5-pro"
# GEMINI_TEMPERATURE = "0.2"

# ============================================
# Search Provider Configuration (Optional)
# Enables technical accuracy verification
# ============================================

# SEARCH_PROVIDER = "perplexity"
# PERPLEXITY_API_KEY = "pplx-0000000000000000"
`;

/**
 * Ensures the global config file exists.
 * If not, creates it with a template.
 */
export function ensureGlobalConfig(): string {
    const configPath = getGlobalConfigPath();
    const configDir = path.dirname(configPath);

    if (!existsSync(configDir)) {
        mkdirSync(configDir, { recursive: true });
    }

    if (!existsSync(configPath)) {
        writeFileSync(configPath, DEFAULT_GLOBAL_CONFIG_TEMPLATE, 'utf-8');
    }

    return configPath;
}

/**
 * Loads the global configuration and injects [env] variables into process.env.
 * Does NOT overwrite existing process.env variables (CLI/shell takes precedence).
 */
export function loadGlobalConfig(): void {
    const configPath = getGlobalConfigPath();

    if (!existsSync(configPath)) {
        return;
    }

    try {
        const rawContent = readFileSync(configPath, 'utf-8');
        const parsedToml = parse(rawContent);
        const config = GLOBAL_CONFIG_SCHEMA.parse(parsedToml);

        if (config.env) {
            for (const [key, value] of Object.entries(config.env)) {
                if (process.env[key] === undefined) {
                    process.env[key] = String(value);
                }
            }
        }
    } catch (e: unknown) {
        const err = handleUnknownError(e, 'Loading global config');
        // Warn but do not crash - critical for resilience
        console.warn(`[vectorlint] Warning: Failed to load global config from ${configPath}: ${err.message}`);
    }
}
