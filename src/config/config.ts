import { loadConfig as loadConfigFromBoundary } from '../boundaries/config-loader.js';

// Re-export the type from schemas
export type { Config } from '../schemas/config-schemas.js';

// Re-export the boundary function as the main config loader
export function loadConfig(cwd: string = process.cwd()) {
  return loadConfigFromBoundary(cwd);
}
