import micromatch from 'micromatch';
import { readFileSync } from 'fs';
import path from 'path';

export interface PromptMapping {
  aliases: Record<string, string>; // alias -> dir path
  includeDefault: string[];
  excludeDefault: string[];
  includeByDir: Record<string, string[]>; // alias -> globs
  excludeByDir: Record<string, string[]>;
  includeById: Record<string, string[]>; // promptId -> globs
  excludeById: Record<string, string[]>;
}

function parseBracketList(val: string): string[] {
  const m = val.trim().match(/^\[(.*)\]$/);
  if (!m) return [];
  return m[1]
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .map(s => s.replace(/^"|"$/g, '').replace(/^'|'$/g, ''));
}

export function readPromptMappingFromIni(iniPath: string): PromptMapping {
  const text = readFileSync(iniPath, 'utf-8');
  const lines = text.split(/\r?\n/);
  let section = '';
  const aliases: Record<string, string> = {};
  const includeDefault: string[] = [];
  const excludeDefault: string[] = [];
  const includeByDir: Record<string, string[]> = {};
  const excludeByDir: Record<string, string[]> = {};
  const includeById: Record<string, string[]> = {};
  const excludeById: Record<string, string[]> = {};

  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || line.startsWith(';')) continue;
    const sec = line.match(/^\[(.+)\]$/);
    if (sec) { section = sec[1]; continue; }
    const kv = line.match(/^([A-Za-z0-9_]+)\s*=\s*(.+)$/);
    if (!kv) continue;
    const key = kv[1];
    const val = kv[2];
    if (section === 'Prompts' && key === 'paths') {
      for (const entry of parseBracketList(val)) {
        const parts = entry.split(':');
        if (parts.length >= 2) {
          const alias = parts[0].trim();
          const dir = parts.slice(1).join(':').trim();
          aliases[alias] = dir;
        }
      }
    } else if (section === 'Defaults') {
      if (key === 'include') includeDefault.push(...parseBracketList(val));
      if (key === 'exclude') excludeDefault.push(...parseBracketList(val));
    } else if (section.startsWith('Directory:')) {
      const alias = section.split(':')[1];
      if (key === 'include') includeByDir[alias] = parseBracketList(val);
      if (key === 'exclude') excludeByDir[alias] = parseBracketList(val);
    } else if (section.startsWith('Prompt:')) {
      const id = section.split(':')[1];
      if (key === 'include') includeById[id] = parseBracketList(val);
      if (key === 'exclude') excludeById[id] = parseBracketList(val);
    }
  }

  return { aliases, includeDefault, excludeDefault, includeByDir, excludeByDir, includeById, excludeById };
}

/**
 * Resolve whether a prompt applies to a given file, with precedence:
 * Prompt: include/exclude → Directory alias: include/exclude → Defaults
 * Excludes union wins. If no includes exist at any level, returns false.
 */
export function resolvePromptMapping(filePath: string, promptId: string, mapping: PromptMapping, aliasHint?: string): boolean {
  const file = filePath.replace(/\\/g, '/');
  // Determine include precedence
  let includes: string[] | undefined = mapping.includeById[promptId];
  let excludes: string[] = [];
  if (!includes) {
    const alias = aliasHint;
    includes = alias ? mapping.includeByDir[alias] : undefined;
    if (alias && mapping.excludeByDir[alias]) excludes.push(...mapping.excludeByDir[alias]);
  }
  // Fallback to defaults
  if (!includes) includes = mapping.includeDefault;
  excludes = [...excludes, ...(mapping.excludeById[promptId] || []), ...mapping.excludeDefault];

  // If there are no includes at any level, do not run
  if (!includes || includes.length === 0) return false;

  const included = micromatch.isMatch(file, includes, { dot: true });
  const excluded = excludes.length > 0 && micromatch.isMatch(file, excludes, { dot: true });
  return included && !excluded;
}

/** Returns true if mapping has any includes configured (defaults, directory, or prompt). */
export function isMappingConfigured(mapping: PromptMapping): boolean {
  if (mapping.includeDefault?.length) return true;
  for (const k of Object.keys(mapping.includeByDir || {})) {
    if (mapping.includeByDir[k]?.length) return true;
  }
  for (const k of Object.keys(mapping.includeById || {})) {
    if (mapping.includeById[k]?.length) return true;
  }
  return false;
}

/**
 * Given a prompt file path and [Prompts].paths alias map, return the alias
 * whose directory contains this prompt. Returns undefined if no match.
 */
export function aliasForPromptPath(promptFullPath: string, mapping: PromptMapping, cwd: string = process.cwd()): string | undefined {
  const normPrompt = path.resolve(promptFullPath).replace(/\\/g, '/');
  // Build absolute alias roots once
  const candidates = Object.entries(mapping.aliases).map(([alias, p]) => [alias, path.resolve(cwd, p).replace(/\\/g, '/')]) as [string, string][];
  // Choose the longest matching base path to be precise when nested
  let best: { alias: string; base: string } | undefined;
  for (const [alias, base] of candidates) {
    if (normPrompt === base || normPrompt.startsWith(base + '/')) {
      if (!best || base.length > best.base.length) best = { alias, base };
    }
  }
  return best?.alias;
}
