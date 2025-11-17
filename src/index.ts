#!/usr/bin/env node
import { program } from 'commander';
import { readFileSync, existsSync } from 'fs';
import * as path from 'path';
import { handleUnknownError } from './errors/index';
import { registerValidateCommand } from './cli/validate-command';
import { registerMainCommand } from './cli/commands';
import { registerValeAICommand } from './cli/vale-ai-command';

// Import evaluators to trigger self-registration
import './evaluators/base-llm-evaluator';
import './evaluators/technical-accuracy-evaluator';

/*
 * Best-effort .env loader without external dependencies.
 * Loads environment variables from .env or .env.local files.
 * Kept inline to avoid external dependencies and maintain simplicity.
 */
function loadDotEnv(): void {
  const candidates = ['.env', '.env.local'];
  for (const filename of candidates) {
    const full = path.resolve(process.cwd(), filename);
    if (!existsSync(full)) continue;
    try {
      const content = readFileSync(full, 'utf-8');
      for (const rawLine of content.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) continue;
        const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
        if (!match || !match[1] || !match[2]) continue;
        const key = match[1];
        let value = match[2];
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        } else {
          const hashAt = value.indexOf(' #');
          if (hashAt !== -1) value = value.slice(0, hashAt).trim();
        }
        if (process.env[key] === undefined) {
          process.env[key] = value;
        }
      }
      break; // stop after first found
    } catch (e: unknown) {
      // ignore parse errors; rely on existing env
      const err = handleUnknownError(e, 'Loading .env file');
      console.warn(`[vectorlint] Warning: ${err.message}`);
    }
  }
}

// Load environment variables at startup
loadDotEnv();

// Set up Commander program
program
  .name('vectorlint')
  .description('AI-powered content compliance checker')
  .version('1.0.0');
// Vale AI command is registered separately

// Options are defined per command to avoid conflicts

// Register commands
registerValidateCommand(program);
registerMainCommand(program);
registerValeAICommand(program);

// Parse command line arguments
program.parse();
