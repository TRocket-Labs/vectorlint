import path from "path";
import type { PromptFile } from "./prompt-loader";

function toPascalCase(value: string): string {
  return value
    .replace(/\.[^.]+$/, "")
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((part) => part[0]!.toUpperCase() + part.slice(1))
    .join("");
}

export function canonicalRuleIdFromPackRule(packName: string, ruleName: string): string {
  return `${toPascalCase(packName || "default")}.${toPascalCase(ruleName || "rule")}`;
}

export function ruleSourceFromPrompt(prompt: PromptFile): string {
  const pack = (prompt.pack || "default").toLowerCase();
  const fileName = path.posix.basename(prompt.filename || `${prompt.id}.md`);
  return path.posix.join("packs", pack, fileName);
}
