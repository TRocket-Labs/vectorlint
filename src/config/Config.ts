import { existsSync, readFileSync } from 'fs';
import path from 'path';

export interface Config {
  promptsPath: string;
}

export function loadConfig(cwd: string = process.cwd()): Config {
  const iniPath = path.resolve(cwd, 'vectorlint.ini');
  let promptsPath = 'prompts';
  if (existsSync(iniPath)) {
    const raw = readFileSync(iniPath, 'utf-8');
    for (const rawLine of raw.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#') || line.startsWith(';') || line.startsWith('[')) continue;
      const m = line.match(/^([A-Za-z][A-Za-z0-9]*)\s*=\s*(.*)$/);
      if (!m) continue;
      const key = m[1];
      const val = m[2];
      if (key === 'promptsPath') {
        promptsPath = val.replace(/^"|"$/g, '').replace(/^'|'$/g, '');
      }
    }
  }
  const abs = path.isAbsolute(promptsPath) ? promptsPath : path.resolve(cwd, promptsPath);
  return { promptsPath: abs };
}
