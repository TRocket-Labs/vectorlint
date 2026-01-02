#!/usr/bin/env node
import { program } from "commander";
import { readFileSync, existsSync } from "fs";
import * as path from "path";
import { handleUnknownError } from "./errors/index";
import { registerValidateCommand } from "./cli/validate-command";
import { registerMainCommand } from "./cli/commands";
import { registerInitCommand } from "./cli/init-command";
import { loadGlobalConfig } from "./config/global-config";

import { CLI_DESCRIPTION, CLI_VERSION } from "./config/constants";

// Import evaluators module to trigger self-registration of all evaluators
import "./evaluators/index";

/*
 * Loads environment variables from Global Config and .env files.
* Hierarchy: CLI/Shell > Local.env > Global Config
 */
function loadEnvironment(): void {
  // 1. Load Local .env (Project specific overrides)
  const candidates = [".env", ".env.local"];
  for (const filename of candidates) {
    const full = path.resolve(process.cwd(), filename);
    if (!existsSync(full)) continue;
    try {
      const content = readFileSync(full, "utf-8");
      for (const rawLine of content.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith("#")) continue;
        const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
        if (!match || !match[1] || !match[2]) continue;
        const key = match[1];
        let value = match[2];
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        } else {
          const hashAt = value.indexOf(" #");
          if (hashAt !== -1) value = value.slice(0, hashAt).trim();
        }
        if (process.env[key] === undefined) {
          process.env[key] = value;
        }
      }
      break; // stop after first found
    } catch (e: unknown) {
      // ignore parse errors; rely on existing env
      const err = handleUnknownError(e, "Loading .env file");
      console.warn(`[vectorlint] Warning: ${err.message}`);
    }
  }

  // 2. Load Global Config (~/.vectorlint/config.toml)
  loadGlobalConfig();

}

// Load environment variables at startup
loadEnvironment();


// Set up Commander program
program
  .name("vectorlint")
  .version(CLI_VERSION)
  .addHelpText('beforeAll', 'vectorlint - An LLM-powered linter for prose.\n')
  .usage(`[options] [command] [paths...]
       vectorlint myfile.md myfile2.md mydir/
       vectorlint --output=json [paths...]`)
  .description(CLI_DESCRIPTION);

// Register commands
registerInitCommand(program);
registerValidateCommand(program);
registerMainCommand(program);

// Handle no args - show help
if (process.argv.length === 2) {
  program.parse(['node', 'vectorlint', '--help']);
} else {
  program.parse();
}
