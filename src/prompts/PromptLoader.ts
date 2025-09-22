import { readdirSync, readFileSync, statSync } from 'fs';
import path from 'path';

export interface PromptFile {
  id: string; // basename without extension
  filename: string;
  text: string;
}

export function loadPrompts(
  dir: string,
  opts: { verbose?: boolean } = {}
): { prompts: PromptFile[]; warnings: string[] } {
  const warnings: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch (e: any) {
    throw new Error(`Failed to read prompts directory: ${e?.message || e}`);
  }

  const prompts: PromptFile[] = [];
  for (const entry of entries) {
    if (!entry.toLowerCase().endsWith('.md')) continue;
    const full = path.resolve(dir, entry);
    try {
      const st = statSync(full);
      if (!st.isFile()) continue;
    } catch (e: any) {
      warnings.push(`Skipping ${entry}: cannot stat file (${e?.message || e})`);
      continue;
    }
    try {
      const text = readFileSync(full, 'utf-8');
      prompts.push({
        id: path.basename(full, path.extname(full)),
        filename: path.basename(full),
        text,
      });
    } catch (e: any) {
      warnings.push(`Skipping ${entry}: cannot read file (${e?.message || e})`);
      continue;
    }
  }

  if (opts.verbose && warnings.length > 0) {
    for (const w of warnings) console.warn(`[vectorlint] ${w}`);
  }

  prompts.sort((a, b) => a.filename.localeCompare(b.filename));
  return { prompts, warnings };
}
