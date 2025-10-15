import { ENV_SCHEMA, type EnvConfig } from '../schemas/env-schemas.js';
import { ValidationError, handleUnknownError } from '../errors/index.js';

/**
 * Parse and validate environment variables using schema validation
 */
export function parseEnvironment(env: unknown = process.env): EnvConfig {
  try {
    return ENV_SCHEMA.parse(env);
  } catch (e: unknown) {
    if (e instanceof Error && 'issues' in e) {
      // Zod error
      throw new ValidationError(`Invalid environment variables: ${e.message}`);
    }
    const err = handleUnknownError(e, 'Environment validation');
    throw new ValidationError(`Environment validation failed: ${err.message}`);
  }
}