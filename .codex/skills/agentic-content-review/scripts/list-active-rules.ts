#!/usr/bin/env tsx
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import process from "node:process";

type RawRule = {
  id?: string;
  name?: string;
  path?: string;
  active?: boolean;
  description?: string;
};

type RuleIndex = {
  pack?: string;
  active?: boolean;
  rules: RawRule[];
};

type ActiveRule = {
  pack: string;
  id: string;
  name: string;
  description: string;
  rulePath: string;
  indexPath: string;
};

type Output = {
  cwd: string;
  rules: ActiveRule[];
  errors: string[];
};

const SKILL_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const DEFAULT_INDEX = path.join(SKILL_ROOT, "rules", "default", "rule-index.yml");

function parseBoolean(value: string): boolean | undefined {
  const normalized = value.trim().toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  return undefined;
}

function unquote(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseKeyValue(line: string): { key: string; value: string } | undefined {
  const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
  if (!match) return undefined;
  return { key: match[1]!, value: unquote(match[2] ?? "") };
}

function assignValue(target: Record<string, unknown>, key: string, value: string): void {
  if (key === "active") {
    const parsed = parseBoolean(value);
    target[key] = parsed ?? value;
    return;
  }
  target[key] = value;
}

function parseRuleIndexYaml(content: string): RuleIndex {
  const result: RuleIndex = { rules: [] };
  let inRules = false;
  let currentRule: RawRule | undefined;

  for (const rawLine of content.split(/\r?\n/)) {
    const withoutComment = rawLine.replace(/\s+#.*$/, "");
    if (withoutComment.trim() === "") continue;

    const indent = withoutComment.match(/^\s*/)?.[0].length ?? 0;
    const trimmed = withoutComment.trim();

    if (indent === 0 && trimmed === "rules:") {
      inRules = true;
      continue;
    }

    if (!inRules && indent === 0) {
      const parsed = parseKeyValue(trimmed);
      if (parsed) assignValue(result as unknown as Record<string, unknown>, parsed.key, parsed.value);
      continue;
    }

    if (inRules) {
      if (trimmed.startsWith("- ")) {
        currentRule = {};
        result.rules.push(currentRule);
        const rest = trimmed.slice(2).trim();
        if (rest) {
          const parsed = parseKeyValue(rest);
          if (parsed) assignValue(currentRule as Record<string, unknown>, parsed.key, parsed.value);
        }
        continue;
      }

      if (currentRule) {
        const parsed = parseKeyValue(trimmed);
        if (parsed) assignValue(currentRule as Record<string, unknown>, parsed.key, parsed.value);
      }
    }
  }

  return result;
}

function listWorkspaceIndexes(root: string): string[] {
  const rulesRoot = path.join(root, ".vlint", "rules");
  if (!existsSync(rulesRoot)) return [];

  return readdirSync(rulesRoot)
    .map((entry) => path.join(rulesRoot, entry))
    .filter((entryPath) => statSync(entryPath).isDirectory())
    .map((packDir) => path.join(packDir, "rule-index.yml"))
    .filter((indexPath) => existsSync(indexPath));
}

function readActiveRules(indexPath: string): ActiveRule[] {
  const parsed = parseRuleIndexYaml(readFileSync(indexPath, "utf8"));
  if (parsed.active === false) return [];

  const pack = parsed.pack || path.basename(path.dirname(indexPath));
  const activeRules: ActiveRule[] = [];

  for (const rule of parsed.rules) {
    if (rule.active === false) continue;
    if (!rule.id || !rule.name || !rule.path) {
      throw new Error(`Invalid rule entry in ${indexPath}: id, name, and path are required`);
    }

    const rulePath = path.resolve(path.dirname(indexPath), rule.path);
    if (!existsSync(rulePath)) {
      throw new Error(`Missing rule file for ${pack}.${rule.id}: ${rulePath}`);
    }

    activeRules.push({
      pack,
      id: rule.id,
      name: rule.name,
      description: rule.description || "",
      rulePath,
      indexPath: path.resolve(indexPath),
    });
  }

  return activeRules;
}

function parseArgs(args: string[]): { cwd: string; includeDefaults: boolean } {
  const includeDefaults = args.includes("--include-defaults");
  const positional = args.filter((arg) => arg !== "--include-defaults");
  return {
    cwd: positional[0] ? path.resolve(positional[0]) : process.cwd(),
    includeDefaults,
  };
}

function main(): void {
  const { cwd, includeDefaults } = parseArgs(process.argv.slice(2));
  const errors: string[] = [];
  const workspaceIndexes = listWorkspaceIndexes(cwd);
  const indexes = [...workspaceIndexes];

  if ((includeDefaults || workspaceIndexes.length === 0) && existsSync(DEFAULT_INDEX)) {
    indexes.push(DEFAULT_INDEX);
  }

  const rules: ActiveRule[] = [];
  for (const indexPath of indexes) {
    try {
      rules.push(...readActiveRules(indexPath));
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  const output: Output = { cwd, rules, errors };
  console.log(JSON.stringify(output, null, 2));
  process.exitCode = errors.length > 0 ? 1 : 0;
}

main();
