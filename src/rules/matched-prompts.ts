import type { FilePatternConfig } from '../boundaries/file-section-parser';
import { ScanPathResolver } from '../boundaries/scan-path-resolver';
import type { PromptFile } from '../prompts/prompt-loader';

export interface MatchedPromptResolution {
  prompts: PromptFile[];
  packs: string[];
  overrides: Record<string, unknown>;
}

function getAvailablePacks(prompts: PromptFile[]): string[] {
  return Array.from(
    new Set(prompts.map((prompt) => prompt.pack).filter((pack): pack is string => pack.length > 0))
  );
}

function isPromptEnabled(
  prompt: PromptFile,
  resolution: { packs: string[]; overrides: Record<string, unknown> }
): boolean {
  if (prompt.pack === '') {
    return true;
  }
  if (!resolution.packs.includes(prompt.pack)) {
    return false;
  }
  if (!prompt.meta?.id) {
    return true;
  }

  const disableKey = `${prompt.pack}.${prompt.meta.id}`;
  const overrideValue = resolution.overrides[disableKey];
  return typeof overrideValue !== 'string' || overrideValue.toLowerCase() !== 'disabled';
}

export function resolveMatchedPromptsForFile(params: {
  filePath: string;
  prompts: PromptFile[];
  scanPaths: FilePatternConfig[];
}): MatchedPromptResolution {
  const { filePath, prompts, scanPaths } = params;
  const availablePacks = getAvailablePacks(prompts);

  if (scanPaths.length === 0) {
    return {
      prompts: [...prompts],
      packs: availablePacks,
      overrides: {},
    };
  }

  const resolver = new ScanPathResolver();
  const resolution = resolver.resolveConfiguration(filePath, scanPaths, availablePacks);

  return {
    prompts: prompts.filter((prompt) => isPromptEnabled(prompt, resolution)),
    packs: resolution.packs,
    overrides: resolution.overrides,
  };
}
