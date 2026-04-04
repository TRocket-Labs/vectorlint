import { existsSync } from 'fs';
import * as path from 'path';

/**
 * Resolves the presets directory for both dev and built modes.
 * - Built mode: __dirname is `dist/cli/`, so `../presets` resolves to `dist/presets/`
 * - Dev mode: __dirname is `src/cli/`, so `../../presets` resolves to project root `presets/`
 */
export function resolvePresetsDir(dir: string): string {
  const buildPath = path.resolve(dir, '../presets');
  if (existsSync(path.join(buildPath, 'meta.json'))) {
    return buildPath;
  }

  // Dev mode fallback: src/cli/ → ../../presets
  const devPath = path.resolve(dir, '../../presets');
  if (existsSync(path.join(devPath, 'meta.json'))) {
    return devPath;
  }

  throw new Error(`Could not locate presets directory containing meta.json. Looked in ${buildPath} and ${devPath}`);
}
