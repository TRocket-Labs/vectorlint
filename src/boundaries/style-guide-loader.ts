import { existsSync, readFileSync } from 'fs';
import * as path from 'path';
import { STYLE_GUIDE_FILENAME, STYLE_GUIDE_TOKEN_WARNING_THRESHOLD } from '../config/constants';

export interface StyleGuideResult {
  content: string | null;
  tokenEstimate: number;
  path: string | null;
}

/**
 * Estimates token count for a given text string.
 * Uses a rough approximation of 4 characters per token.
 */
export function estimateTokens(text: string): number {
  return Math.ceil((text?.length ?? 0) / 4);
}

/**
 * Loads the VECTORLINT.md style guide from the specified directory.
 * Checks for the file, reads it, estimates tokens, and warns if it exceeds the threshold.
 */
export function loadStyleGuide(cwd: string): StyleGuideResult {
  const styleGuidePath = path.resolve(cwd, STYLE_GUIDE_FILENAME);

  if (!existsSync(styleGuidePath)) {
    return {
      content: null,
      tokenEstimate: 0,
      path: null
    };
  }

  try {
    const content = readFileSync(styleGuidePath, 'utf-8');
    const tokenEstimate = estimateTokens(content);

    if (tokenEstimate > STYLE_GUIDE_TOKEN_WARNING_THRESHOLD) {
      console.warn(
        `[vectorlint] Warning: ${STYLE_GUIDE_FILENAME} is approximately ${tokenEstimate} tokens, ` +
        `which exceeds the recommended limit of ${STYLE_GUIDE_TOKEN_WARNING_THRESHOLD}. ` +
        `This may impact performance and costs.`
      );
    }

    return {
      content,
      tokenEstimate,
      path: styleGuidePath
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[vectorlint] Failed to read ${STYLE_GUIDE_FILENAME}: ${message}`);

    return {
      content: null,
      tokenEstimate: 0,
      path: styleGuidePath // Return path even on error so caller knows it existed
    };
  }
}
