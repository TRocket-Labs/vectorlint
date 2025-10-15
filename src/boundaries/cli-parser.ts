import { CLI_OPTIONS_SCHEMA, VALIDATE_OPTIONS_SCHEMA, type CliOptions, type ValidateOptions } from '../schemas/cli-schemas.js';
import { ValidationError, handleUnknownError } from '../errors/index.js';

/**
 * Parse and validate CLI options from Commander.js
 */
export function parseCliOptions(raw: unknown): CliOptions {
  try {
    return CLI_OPTIONS_SCHEMA.parse(raw);
  } catch (e: unknown) {
    if (e instanceof Error && 'issues' in e) {
      // Zod error
      throw new ValidationError(`Invalid CLI options: ${e.message}`);
    }
    const err = handleUnknownError(e, 'CLI option parsing');
    throw new ValidationError(`CLI option parsing failed: ${err.message}`);
  }
}

/**
 * Parse and validate validate command options
 */
export function parseValidateOptions(raw: unknown): ValidateOptions {
  try {
    return VALIDATE_OPTIONS_SCHEMA.parse(raw);
  } catch (e: unknown) {
    if (e instanceof Error && 'issues' in e) {
      // Zod error
      throw new ValidationError(`Invalid validate options: ${e.message}`);
    }
    const err = handleUnknownError(e, 'Validate option parsing');
    throw new ValidationError(`Validate option parsing failed: ${err.message}`);
  }
}