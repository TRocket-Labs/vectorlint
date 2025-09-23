import { readdirSync, readFileSync, statSync } from 'fs';
import path from 'path';
import YAML from 'yaml';

export type Severity = 'warning' | 'error';

export interface PromptCriterionSpec {
  id?: string;
  name?: string;
  weight: number;
  target?: {
    regex?: string;
    flags?: string;
    group?: number;
    required?: boolean;
    suggestion?: string;
  };
}

export interface PromptMeta {
  specVersion?: string;
  threshold?: number;
  severity?: Severity;
  id?: string;
  name?: string;
  target?: {
    regex?: string;
    flags?: string;
    group?: number;
    required?: boolean;
    suggestion?: string;
  };
  criteria: PromptCriterionSpec[];
}

export interface PromptFile {
  id: string; // basename without extension
  filename: string; // basename only
  fullPath: string; // absolute path to the prompt file
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
              threshold: data.threshold !== undefined ? Number(data.threshold) : undefined,
              severity: data.severity,
              id: typeof data.id === 'string' ? data.id : undefined,
              name: typeof data.name === 'string' ? data.name : undefined,
              target: data.target ? {
                regex: data.target.regex,
                flags: data.target.flags,
                group: data.target.group !== undefined ? Number(data.target.group) : undefined,
                required: data.target.required === true,
                suggestion: data.target.suggestion,
              } : undefined,
              criteria: Array.isArray(data.criteria) ? data.criteria.map((c: any) => ({
                id: c.id,
                name: c.name,
                weight: Number(c.weight),
                target: c.target ? {
                  regex: c.target.regex,
                  flags: c.target.flags,
                  group: c.target.group !== undefined ? Number(c.target.group) : undefined,
                  required: c.target.required === true,
                  suggestion: c.target.suggestion,
                } : undefined,
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
      if (meta.severity && meta.severity !== 'warning' && meta.severity !== 'error') {
        warnings.push(`Skipping ${entry}: invalid severity`);
        continue;
      }
      if (meta.target) {
        if (meta.target.group !== undefined && (meta.target.group as number) < 0) {
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
