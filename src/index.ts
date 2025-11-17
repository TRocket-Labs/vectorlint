#!/usr/bin/env node
import { program } from 'commander';
import { readFileSync, existsSync } from 'fs';
import * as path from 'path';
import { handleUnknownError } from './errors/index';
import { registerValidateCommand } from './cli/validate-command';
import { registerMainCommand } from './cli/commands';

// Import evaluators to trigger self-registration
import './evaluators/base-llm-evaluator';
import './evaluators/technical-accuracy-evaluator';

// Best-effort .env loader without external deps
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

program
  .name('vectorlint')
  .description('AI-powered content compliance checker')
  .version('1.0.0');

// Register validate command
registerValidateCommand(program, loadDotEnv);

// Register main command
registerMainCommand(program, loadDotEnv);

program.parse();
