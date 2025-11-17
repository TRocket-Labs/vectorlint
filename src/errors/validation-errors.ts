export class ValidationError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'ValidationError';
    
    // Maintain error stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ValidationError);
    }
  }
}

export class APIResponseError extends ValidationError {
  constructor(message: string, public readonly response: unknown, cause?: unknown) {
    super(`API Response Error: ${message}`, cause);
    this.name = 'APIResponseError';
    
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, APIResponseError);
    }
  }
}

export class SchemaValidationError extends ValidationError {
  constructor(
    message: string, 
    public readonly schema: string,
    public readonly data: unknown,
    cause?: unknown
  ) {
    super(`Schema Validation Error (${schema}): ${message}`, cause);
    this.name = 'SchemaValidationError';
    
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, SchemaValidationError);
    }
  }
}

export class MockValidationError extends ValidationError {
  constructor(
    message: string,
    public readonly mockType: string,
    public readonly params: unknown,
    cause?: unknown
  ) {
    super(`Mock Validation Error (${mockType}): ${message}`, cause);
    this.name = 'MockValidationError';
    
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, MockValidationError);
    }
  }
}

export function createValidationError(
  message: string,
  cause?: unknown,
  context?: { schema?: string; data?: unknown; response?: unknown }
): ValidationError {
  if (context?.response !== undefined) {
    return new APIResponseError(message, context.response, cause);
  }
  
  if (context?.schema && context?.data !== undefined) {
    return new SchemaValidationError(message, context.schema, context.data, cause);
  }
  
  return new ValidationError(message, cause);
}

/**
 * Type guard to check if an error is a validation error
 */
export function isValidationError(error: unknown): error is ValidationError {
  return error instanceof ValidationError;
}

export function isAPIResponseError(error: unknown): error is APIResponseError {
  return error instanceof APIResponseError;
}

export function isSchemaValidationError(error: unknown): error is SchemaValidationError {
  return error instanceof SchemaValidationError;
}

export function isMockValidationError(error: unknown): error is MockValidationError {
  return error instanceof MockValidationError;
}