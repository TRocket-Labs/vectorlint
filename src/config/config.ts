import { loadConfig as loadConfigFromBoundary } from '../boundaries/config-loader';

// Re-export the type from schemas
export type { Config } from '../schemas/config-schemas';

// Re-export the boundary function as the main config loader
export function loadConfig(cwd: string = process.cwd()) {
  return loadConfigFromBoundary(cwd);
}
