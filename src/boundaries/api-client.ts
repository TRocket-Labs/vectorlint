import { OPENAI_RESPONSE_SCHEMA, type OpenAIResponse } from '../schemas/api-schemas.js';
import { ValidationError, handleUnknownError } from '../errors/index.js';

/**
 * Validate OpenAI API response using schema validation
 */
export function validateApiResponse(raw: unknown): OpenAIResponse {
  try {
    return OPENAI_RESPONSE_SCHEMA.parse(raw);
  } catch (e: unknown) {
    if (e instanceof Error && 'issues' in e) {
      // Zod error
      throw new ValidationError(`Invalid API response: ${e.message}`);
    }
    const err = handleUnknownError(e, 'API response validation');
    throw new ValidationError(`API response validation failed: ${err.message}`);
  }
}