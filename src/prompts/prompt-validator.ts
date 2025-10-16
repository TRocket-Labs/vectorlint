import { PromptFile, PromptMeta, PromptCriterionSpec } from '../schemas/prompt-schemas';

export type ValidationLevel = 'error' | 'warning';
export interface Validation {
  file: string;
  level: ValidationLevel;
  message: string;
}

const ALLOWED_FLAGS = new Set(['g', 'i', 'm', 's', 'u', 'y']);

function validateFlags(flags?: string): boolean {
  if (!flags) return true;
  for (const ch of flags) if (!ALLOWED_FLAGS.has(ch)) return false;
  return true;
}

function uniqueIds(criteria: PromptCriterionSpec[]): string[] {
  const seen = new Set<string>();
  const dups: string[] = [];
  for (const c of criteria) {
    const id = String(c.id);
    if (seen.has(id)) dups.push(id); else seen.add(id);
  }
  return dups;
}

export function validatePrompt(p: PromptFile): Validation[] {
  const out: Validation[] = [];
  const meta: PromptMeta = p.meta;

  if (!meta.criteria || meta.criteria.length === 0) {
    out.push({ file: p.filename, level: 'error', message: 'No criteria defined' });
    return out;
  }

  let sumWeights = 0;
  for (const c of meta.criteria) {
    if (!c.id && !c.name) {
      out.push({ file: p.filename, level: 'error', message: 'Criterion missing id/name' });
    }
    const w = Number(c.weight);
    if (!Number.isFinite(w) || w <= 0) {
      out.push({ file: p.filename, level: 'error', message: `Invalid weight for ${c.name || c.id}` });
    } else {
      sumWeights += w;
    }
    if (c.target) {
      if (!validateFlags(c.target.flags)) {
        out.push({ file: p.filename, level: 'error', message: `Invalid regex flags in target for ${c.name || c.id}` });
      }
      if (c.target.group !== undefined && (!Number.isInteger(c.target.group) || c.target.group < 0)) {
        out.push({ file: p.filename, level: 'error', message: `Invalid target.group for ${c.name || c.id}` });
      }
      if (c.target.regex) {
        try { new RegExp(c.target.regex, c.target.flags || ''); } catch {
          out.push({ file: p.filename, level: 'error', message: `Invalid target.regex for ${c.name || c.id}` });
        }
      }
      if (c.target.suggestion && typeof c.target.suggestion !== 'string') {
        out.push({ file: p.filename, level: 'error', message: `Invalid target.suggestion for ${c.name || c.id}` });
      }
    }
  }

  const dups = uniqueIds(meta.criteria);
  for (const id of dups) out.push({ file: p.filename, level: 'error', message: `Duplicate criterion id: ${id}` });

  if (meta.threshold !== undefined) {
    const t = Number(meta.threshold);
    if (!Number.isFinite(t) || t < 0) {
      out.push({ file: p.filename, level: 'error', message: 'threshold must be a non-negative number' });
    } else if (sumWeights > 0 && t > sumWeights) {
      out.push({ file: p.filename, level: 'warning', message: `threshold (${t}) exceeds sum of weights (${sumWeights})` });
    }
  }
  if (meta.severity !== undefined && meta.severity !== 'warning' && meta.severity !== 'error') {
    out.push({ file: p.filename, level: 'error', message: 'severity must be "warning" or "error"' });
  }

  if (meta.target) {
    if (!validateFlags(meta.target.flags)) {
      out.push({ file: p.filename, level: 'error', message: 'Invalid regex flags in global target' });
    }
    if (meta.target.group !== undefined && (!Number.isInteger(meta.target.group) || meta.target.group < 0)) {
      out.push({ file: p.filename, level: 'error', message: 'Invalid global target.group' });
    }
    if (meta.target.regex) {
      try { new RegExp(meta.target.regex, meta.target.flags || ''); } catch {
        out.push({ file: p.filename, level: 'error', message: 'Invalid global target.regex' });
      }
    }
  }

  return out;
}

export function validateAll(prompts: PromptFile[]): { errors: Validation[]; warnings: Validation[] } {
  const errors: Validation[] = [];
  const warnings: Validation[] = [];
  for (const p of prompts) {
    const findings = validatePrompt(p);
    for (const f of findings) (f.level === 'error' ? errors : warnings).push(f);
  }
  return { errors, warnings };
}

