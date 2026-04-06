import { readdirSync, readFileSync, statSync } from 'fs';
import path from 'path';
import YAML from 'yaml';
import { RULE_META_SCHEMA, type RuleFile, type RuleMeta } from '../schemas/rule-schemas';
import { Severity } from '../evaluators/types';

// Re-export types for consumers
export type { RuleFile, RuleMeta, RuleCriterionSpec } from '../schemas/rule-schemas';

export function loadRuleFile(fullPath: string, packName: string): { rule: RuleFile | undefined; warning?: string } {
  try {
    const raw = readFileSync(fullPath, 'utf-8');
    let meta: RuleMeta | undefined;
    let content = raw;
    if (raw.startsWith('---')) {
      const end = raw.indexOf('\n---', 3);
      if (end !== -1) {
        const yamlBlock = raw.slice(3, end).trim();
        try {
          const rawData: unknown = YAML.parse(yamlBlock) || {};
          meta = RULE_META_SCHEMA.parse(rawData);
        } catch (e: unknown) {
          const err = e instanceof Error ? e : new Error(String(e));
          return { rule: undefined, warning: `Skipping ${path.basename(fullPath)}: invalid YAML frontmatter (${err.message})` };
        }
        content = raw.slice(end + 4).replace(/^\s*\n/, '');
      }
    }
    if (!meta) {
      return { rule: undefined, warning: `Skipping ${path.basename(fullPath)}: invalid or missing frontmatter` };
    }

    // Validate required fields
    if (!meta.id) {
      return { rule: undefined, warning: `Skipping ${path.basename(fullPath)}: missing required field 'id'` };
    }
    if (!meta.name) {
      return { rule: undefined, warning: `Skipping ${path.basename(fullPath)}: missing required field 'name'` };
    }

    // Criteria validation (if present)
    if (meta.criteria && meta.criteria.length > 0) {
      for (const c of meta.criteria) {
        if (!c.id) {
          return { rule: undefined, warning: `Skipping ${path.basename(fullPath)}: criterion missing required field 'id'` };
        }
        if (!c.name) {
          return { rule: undefined, warning: `Skipping ${path.basename(fullPath)}: criterion missing required field 'name'` };
        }
      }

      // Ensure unique criterion ids
      const ids = new Set<string>();
      for (const c of meta.criteria) {
        const cid = String(c.id);
        if (ids.has(cid)) {
          return { rule: undefined, warning: `Skipping ${path.basename(fullPath)}: duplicate criterion id '${cid}'` };
        }
        ids.add(cid);
      }
    }

    if (meta.severity && meta.severity !== Severity.WARNING && meta.severity !== Severity.ERROR) {
      return { rule: undefined, warning: `Skipping ${path.basename(fullPath)}: invalid severity` };
    }
    if (meta.target) {
      if (meta.target.group !== undefined && (meta.target.group) < 0) {
        return { rule: undefined, warning: `Skipping ${path.basename(fullPath)}: invalid top-level target.group` };
      }
    }

    return {
      rule: {
        id: path.basename(fullPath, path.extname(fullPath)),
        filename: path.basename(fullPath),
        fullPath: fullPath,
        meta,
        content,
        pack: packName,
      }
    };
  } catch (e: unknown) {
    const err = e instanceof Error ? e : new Error(String(e));
    return { rule: undefined, warning: `Skipping ${path.basename(fullPath)}: cannot read file (${err.message})` };
  }
}

export function loadRules(
  dir: string,
  opts: { verbose?: boolean } = {}
): { rules: RuleFile[]; warnings: string[] } {
  const warnings: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch (e: unknown) {
    const err = e instanceof Error ? e : new Error(String(e));
    throw new Error(`Failed to read rules directory: ${err.message}`);
  }

  const rules: RuleFile[] = [];
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

    const result = loadRuleFile(full, 'Default');
    if (result.warning) {
      warnings.push(result.warning);
    }
    if (result.rule) {
      rules.push(result.rule);
    }
  }

  if (opts.verbose && warnings.length > 0) {
    for (const w of warnings) console.warn(`[vectorlint] ${w}`);
  }

  rules.sort((a, b) => a.filename.localeCompare(b.filename));
  return { rules, warnings };
}
