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
      if (!meta) {
        warnings.push(`Skipping ${entry}: invalid or missing frontmatter`);
        continue;
      }

      // Validate required fields
      if (!meta.id) {
        warnings.push(`Skipping ${entry}: missing required field 'id'`);
        continue;
      }
      if (!meta.name) {
        warnings.push(`Skipping ${entry}: missing required field 'name'`);
        continue;
      }

      // Basic evaluator validation
      if (meta.evaluator === 'basic') {
        if (meta.criteria && meta.criteria.length > 0) {
          for (const c of meta.criteria) {
            if (!c.id) {
              warnings.push(`Skipping ${entry}: criterion missing required field 'id'`);
              meta = undefined;
              break;
            }
            if (!c.name) {
              warnings.push(`Skipping ${entry}: criterion missing required field 'name'`);
              meta = undefined;
              break;
            }
            if (c.weight !== undefined) {
              warnings.push(`Skipping ${entry}: basic evaluator cannot have 'weight' in criteria`);
              meta = undefined;
              break;
            }
          }
          if (!meta) continue;

          // Ensure unique criterion ids
          const ids = new Set<string>();
          for (const c of meta.criteria) {
            const cid = String(c.id);
            if (ids.has(cid)) {
              warnings.push(`Skipping ${entry}: duplicate criterion id '${cid}'`);
              meta = undefined;
              break;
            }
            ids.add(cid);
          }
          if (!meta) continue;
        }
      }

      // Advanced evaluator validation
      if (meta.evaluator !== 'basic') {
        if (!meta.criteria || meta.criteria.length === 0) {
          warnings.push(`Skipping ${entry}: advanced evaluator requires criteria`);
          continue;
        }
        for (const c of meta.criteria) {
          if (!c.id) {
            warnings.push(`Skipping ${entry}: criterion missing required field 'id'`);
            meta = undefined;
            break;
          }
          if (!c.name) {
            warnings.push(`Skipping ${entry}: criterion missing required field 'name'`);
            meta = undefined;
            break;
          }
          if (!c.weight || Number.isNaN(c.weight)) {
            warnings.push(`Skipping ${entry}: criterion missing required field 'weight'`);
            meta = undefined;
            break;
          }
        }
        if (!meta) continue;

        // Ensure unique criterion ids
        if (meta.criteria) {
          const ids = new Set<string>();
          for (const c of meta.criteria) {
            const cid = String(c.id);
            if (ids.has(cid)) {
              warnings.push(`Skipping ${entry}: duplicate criterion id '${cid}'`);
              meta = undefined;
              break;
            }
            ids.add(cid);
          }
          if (!meta) continue;
        }
      }

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

      // No auto-generation - use values as-is
      prompts.push({
        id: path.basename(full, path.extname(full)),
        filename: path.basename(full),
        fullPath: full,
        meta,
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
