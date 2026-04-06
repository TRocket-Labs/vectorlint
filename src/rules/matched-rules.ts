import type { FilePatternConfig } from '../boundaries/file-section-parser';
import { ScanPathResolver } from '../boundaries/scan-path-resolver';
import type { RuleFile } from '../schemas/rule-schemas';

export interface MatchedRuleResolution {
  rules: RuleFile[];
  packs: string[];
  overrides: Record<string, unknown>;
}

function getAvailablePacks(rules: RuleFile[]): string[] {
  return Array.from(
    new Set(rules.map((rule) => rule.pack).filter((pack): pack is string => pack.length > 0))
  );
}

function isRuleEnabled(
  rule: RuleFile,
  resolution: { packs: string[]; overrides: Record<string, unknown> }
): boolean {
  if (rule.pack === '') {
    return true;
  }
  if (!resolution.packs.includes(rule.pack)) {
    return false;
  }
  if (!rule.meta?.id) {
    return true;
  }

  const disableKey = `${rule.pack}.${rule.meta.id}`;
  const overrideValue = resolution.overrides[disableKey];
  return typeof overrideValue !== 'string' || overrideValue.toLowerCase() !== 'disabled';
}

export function resolveMatchedRulesForFile(params: {
  filePath: string;
  rules: RuleFile[];
  scanPaths: FilePatternConfig[];
}): MatchedRuleResolution {
  const { filePath, rules, scanPaths } = params;
  const availablePacks = getAvailablePacks(rules);

  if (scanPaths.length === 0) {
    return {
      rules: [...rules],
      packs: availablePacks,
      overrides: {},
    };
  }

  const resolver = new ScanPathResolver();
  const resolution = resolver.resolveConfiguration(filePath, scanPaths, availablePacks);

  return {
    rules: rules.filter((rule) => isRuleEnabled(rule, resolution)),
    packs: resolution.packs,
    overrides: resolution.overrides,
  };
}
