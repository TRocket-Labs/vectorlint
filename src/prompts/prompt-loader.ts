import { readdirSync, readFileSync, statSync } from 'fs';
import path from 'path';
import YAML from 'yaml';
import { PROMPT_META_SCHEMA, type PromptFile, type PromptMeta } from '../schemas/prompt-schemas';

// Re-export types for backward compatibility
export type { PromptFile, PromptMeta, PromptCriterionSpec } from '../schemas/prompt-schemas';

export function loadPrompts(
  dir: string,
  opts: { verbose?: boolean } = {}
): { prompts: PromptFile[]; warnings: string[] } {
  const warnings: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch (e: unknown) {
    const err = e instanceof Error ? e : new Error(String(e));
    throw new Error(`Failed to read prompts directory: ${err.message}`);
  }

  const prompts: PromptFile[] = [];
  for (const entry of entries) {
    if (!entry.toLowerCase().endsWith('.md')) continue;
    const full = path.resolve(dir, entry);
    try {
      const st = statSync(full);
      if (!st.isFile()) continue;
    } catch (e: unknown) {
      const err = e instanceof Error ? e : new Error(String(e));
      warnings.push(`Skipping ${entry}: cannot stat file (${err.message})`);
      continue;
    }
    try {
      const raw = readFileSync(full, 'utf-8');
      let meta: PromptMeta | undefined;
      let body = raw;
      if (raw.startsWith('---')) {
        const end = raw.indexOf('\n---', 3);
        if (end !== -1) {
          const yamlBlock = raw.slice(3, end).trim();
          try {
            const rawData: unknown = YAML.parse(yamlBlock) || {};
            meta = PROMPT_META_SCHEMA.parse(rawData);
          } catch (e: unknown) {
            const err = e instanceof Error ? e : new Error(String(e));
            warnings.push(`Skipping ${entry}: invalid YAML frontmatter (${err.message})`);
            continue;
          }
          body = raw.slice(end + 4).replace(/^\s*\n/, '');
        }
      }
      if (!meta || !Array.isArray(meta.criteria) || meta.criteria.length === 0) {
        warnings.push(`Skipping ${entry}: missing or invalid criteria in frontmatter`);
        continue;
      }
      // Helpers
      const toPascal = (s: string) => s
        .split(/[^A-Za-z0-9]+/)
        .filter(Boolean)
        .map((x) => x.charAt(0).toUpperCase() + x.slice(1))
        .join('');

      // Basic validation and derive ids/names
      for (const c of meta.criteria) {
        if ((!c.name && !c.id) || !c.weight || Number.isNaN(c.weight)) {
          warnings.push(`Skipping ${entry}: invalid criterion (id/name or weight missing)`);
          meta = undefined;
          break;
        }
        if (!c.id && c.name) c.id = toPascal(String(c.name));
        if (!c.name && c.id) c.name = String(c.id);
      }
      if (!meta) continue;
      // Ensure unique criterion ids
      const ids = new Set<string>();
      for (const c of meta.criteria) {
        const cid = String(c.id);
        if (ids.has(cid)) {
          warnings.push(`Skipping ${entry}: duplicate criterion id ${cid}`);
          meta = undefined;
          break;
        }
        ids.add(cid);
      }
      if (!meta) continue;
      if (meta.severity && meta.severity !== 'warning' && meta.severity !== 'error') {
        warnings.push(`Skipping ${entry}: invalid severity`);
        continue;
      }
      if (meta.target) {
        if (meta.target.group !== undefined && (meta.target.group) < 0) {
          warnings.push(`Skipping ${entry}: invalid top-level target.group`);
          continue;
        }
        // regex/flags are strings if present; no further validation here
      }
      // Derive prompt id and display name if not provided
      const baseName = path.basename(full, path.extname(full));
      const pascal = toPascal(baseName);

      prompts.push({
        id: path.basename(full, path.extname(full)),
        filename: path.basename(full),
        fullPath: full,
        meta: { ...meta, id: meta.id || pascal, name: meta.name || (pascal.replace(/([A-Z])/g, ' $1').trim()) },
        body,
      });
    } catch (e: unknown) {
      const err = e instanceof Error ? e : new Error(String(e));
      warnings.push(`Skipping ${entry}: cannot read file (${err.message})`);
      continue;
    }
  }

  if (opts.verbose && warnings.length > 0) {
    for (const w of warnings) console.warn(`[vectorlint] ${w}`);
  }

  prompts.sort((a, b) => a.filename.localeCompare(b.filename));
  return { prompts, warnings };
}
