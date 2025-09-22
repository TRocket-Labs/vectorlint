import { readdirSync, readFileSync, statSync } from 'fs';
import path from 'path';
import YAML from 'yaml';

export type Severity = 'warning' | 'error';

export interface PromptCriterionSpec {
  id?: string;
  name?: string;
  weight: number;
  threshold?: number;
  severity?: Severity;
}

export interface PromptMeta {
  specVersion?: string;
  severity?: Severity;
  threshold?: number;
  id?: string;
  name?: string;
  criteria: PromptCriterionSpec[];
}

export interface PromptFile {
  id: string; // basename without extension
  filename: string;
  meta: PromptMeta;
  body: string;
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
      const raw = readFileSync(full, 'utf-8');
      let meta: PromptMeta | undefined;
      let body = raw;
      if (raw.startsWith('---')) {
        const end = raw.indexOf('\n---', 3);
        if (end !== -1) {
          const yamlBlock = raw.slice(3, end).trim();
          try {
            const data = YAML.parse(yamlBlock) || {};
            meta = {
              specVersion: data.specVersion,
              severity: data.severity,
              threshold: data.threshold,
              id: typeof data.id === 'string' ? data.id : undefined,
              name: typeof data.name === 'string' ? data.name : undefined,
              criteria: Array.isArray(data.criteria) ? data.criteria.map((c: any) => ({
                id: c.id,
                name: c.name,
                weight: Number(c.weight),
                threshold: c.threshold !== undefined ? Number(c.threshold) : undefined,
                severity: c.severity,
              })) : [],
            } as PromptMeta;
          } catch (e: any) {
            warnings.push(`Skipping ${entry}: invalid YAML frontmatter (${e?.message || e})`);
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
          meta = undefined as any;
          break;
        }
        if (!c.id && c.name) c.id = toPascal(String(c.name));
        if (!c.name && c.id) c.name = String(c.id);
        if (c.threshold !== undefined && (c.threshold < 0 || c.threshold > 4)) {
          warnings.push(`Skipping ${entry}: invalid threshold for ${c.name} (must be 0-4)`);
          meta = undefined as any;
          break;
        }
        if (c.severity && c.severity !== 'warning' && c.severity !== 'error') {
          warnings.push(`Skipping ${entry}: invalid severity for ${c.name}`);
          meta = undefined as any;
          break;
        }
      }
      if (!meta) continue;
      // Ensure unique criterion ids
      const ids = new Set<string>();
      for (const c of meta.criteria) {
        const cid = String(c.id);
        if (ids.has(cid)) {
          warnings.push(`Skipping ${entry}: duplicate criterion id ${cid}`);
          meta = undefined as any;
          break;
        }
        ids.add(cid);
      }
      if (!meta) continue;
      if (meta.threshold !== undefined && (meta.threshold < 0 || meta.threshold > 4)) {
        warnings.push(`Skipping ${entry}: invalid top-level threshold (must be 0-4)`);
        continue;
      }
      if (meta.severity && meta.severity !== 'warning' && meta.severity !== 'error') {
        warnings.push(`Skipping ${entry}: invalid top-level severity`);
        continue;
      }
      // Derive prompt id and display name if not provided
      const baseName = path.basename(full, path.extname(full));
      const pascal = toPascal(baseName);

      prompts.push({
        id: path.basename(full, path.extname(full)),
        filename: path.basename(full),
        meta: { ...meta, id: meta.id || pascal, name: meta.name || (pascal.replace(/([A-Z])/g, ' $1').trim()) },
        body,
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
