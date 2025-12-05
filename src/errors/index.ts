// Base error class for all vectorlint errors
export class VectorlintError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = 'VectorlintError';
  }
}

// Validation error for schema validation failures
export class ValidationError extends VectorlintError {
  constructor(message: string) {
    super(message, 'VALIDATION_ERROR');
    this.name = 'ValidationError';
  }
}

// Configuration error for config file issues
export class ConfigError extends VectorlintError {
  constructor(message: string) {
    super(message, 'CONFIG_ERROR');
    this.name = 'ConfigError';
  }
}

// Processing error for business logic failures
export class ProcessingError extends VectorlintError {
  constructor(message: string) {
    super(message, 'PROCESSING_ERROR');
    this.name = 'ProcessingError';
  }
}

// Missing dependency error for when required dependencies are not available
export class MissingDependencyError extends VectorlintError {
  constructor(
    message: string,
    public readonly dependency: string,
    public readonly hint?: string
  ) {
    super(message, 'MISSING_DEPENDENCY');
    this.name = 'MissingDependencyError';
  }
}

// Utility function to handle unknown errors safely
export function handleUnknownError(e: unknown, context: string): Error {
  if (e instanceof Error) {
    return e;
  }
  return new Error(`${context}: ${String(e)}`);
}
