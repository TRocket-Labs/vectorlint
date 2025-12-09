import { CLI_OPTIONS_SCHEMA, VALIDATE_OPTIONS_SCHEMA, CONVERT_OPTIONS_SCHEMA, type CliOptions, type ValidateOptions, type ConvertOptions } from '../schemas/cli-schemas';
import { ValidationError, handleUnknownError } from '../errors/index';

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

export function parseConvertOptions(raw: unknown): ConvertOptions {
  try {
    return CONVERT_OPTIONS_SCHEMA.parse(raw);
  } catch (e: unknown) {
    if (e instanceof Error && 'issues' in e) {
      // Zod error
      throw new ValidationError(`Invalid convert options: ${e.message}`);
    }
    const err = handleUnknownError(e, 'Convert option parsing');
    throw new ValidationError(`Convert option parsing failed: ${err.message}`);
  }
}
