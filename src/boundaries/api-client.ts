import { 
  OPENAI_RESPONSE_SCHEMA, 
  ANTHROPIC_MESSAGE_SCHEMA,
  type OpenAIResponse,
  type AnthropicMessage 
} from '../schemas/api-schemas';
import { ValidationError, handleUnknownError } from '../errors/index';

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

export function validateAnthropicResponse(raw: unknown): AnthropicMessage {
  try {
    return ANTHROPIC_MESSAGE_SCHEMA.parse(raw);
  } catch (e: unknown) {
    if (e instanceof Error && 'issues' in e) {
      // Zod error
      throw new ValidationError(`Invalid Anthropic API response: ${e.message}`);
    }
    const err = handleUnknownError(e, 'Anthropic API response validation');
    throw new ValidationError(`Anthropic API response validation failed: ${err.message}`);
  }
}
