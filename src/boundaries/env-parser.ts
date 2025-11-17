import { z } from 'zod';
import { ENV_SCHEMA_WITH_DEFAULTS, type EnvConfig } from '../schemas/env-schemas';
import { ValidationError, handleUnknownError } from '../errors/index';

export function parseEnvironment(env: unknown = process.env): EnvConfig {
  try {
    return ENV_SCHEMA_WITH_DEFAULTS.parse(env);
  } catch (e: unknown) {
    if (e instanceof z.ZodError) {
      // Zod error - provide specific error messages for missing provider-specific variables
      const errorMessage = formatProviderValidationError(e, env);
      throw new ValidationError(`Invalid environment variables: ${errorMessage}`);
    }
    const err = handleUnknownError(e, 'Environment validation');
    throw new ValidationError(`Environment validation failed: ${err.message}`);
  }
}

function formatProviderValidationError(zodError: z.ZodError, env: unknown): string {
  const issues = zodError.issues;
  const envObj = typeof env === 'object' && env !== null ? env as Record<string, unknown> : {};
  const providerType = envObj.LLM_PROVIDER as string | undefined;
  
  // Check for discriminated union errors (invalid provider type)
  const discriminatorIssue = issues.find(issue => 
    issue.code === 'invalid_union_discriminator' || 
    (issue.path.length === 1 && issue.path[0] === 'LLM_PROVIDER')
  );
  
  if (discriminatorIssue) {
    return `LLM_PROVIDER must be either 'azure-openai', 'anthropic', or 'openai'. Received: ${providerType ?? 'undefined'}`;
  }
  
  // Check for missing required fields based on provider type
  const missingFields = issues
    .filter(issue => issue.code === 'invalid_type' && issue.received === 'undefined')
    .map(issue => issue.path.join('.'));
  
  if (missingFields.length > 0) {
    if (providerType === 'azure-openai' || (!providerType && missingFields.some(field => field.startsWith('AZURE_OPENAI_')))) {
      const azureFields = missingFields.filter(field => field.startsWith('AZURE_OPENAI_'));
      if (azureFields.length > 0) {
        return `Missing required Azure OpenAI environment variables: ${azureFields.join(', ')}. When using LLM_PROVIDER=azure-openai, ensure AZURE_OPENAI_API_KEY, AZURE_OPENAI_ENDPOINT, and AZURE_OPENAI_DEPLOYMENT_NAME are set.`;
      }
    }
    
    if (providerType === 'anthropic') {
      const anthropicFields = missingFields.filter(field => field.startsWith('ANTHROPIC_'));
      if (anthropicFields.length > 0) {
        return `Missing required Anthropic environment variables: ${anthropicFields.join(', ')}. When using LLM_PROVIDER=anthropic, ensure ANTHROPIC_API_KEY is set.`;
      }
    }
    
    if (providerType === 'openai') {
      const openaiFields = missingFields.filter(field => field.startsWith('OPENAI_'));
      if (openaiFields.length > 0) {
        return `Missing required OpenAI environment variables: ${openaiFields.join(', ')}. When using LLM_PROVIDER=openai, ensure OPENAI_API_KEY is set.`;
      }
    }
  }
  
  // Check for validation errors (e.g., invalid URL, number out of range)
  const validationIssues = issues.filter(issue => 
    issue.code === 'invalid_string' || 
    issue.code === 'too_small' || 
    issue.code === 'too_big' ||
    issue.code === 'invalid_type'
  );
  
  if (validationIssues.length > 0) {
    const fieldErrors = validationIssues.map(issue => {
      const field = issue.path.join('.');
      return `${field}: ${issue.message}`;
    });
    
    return `Invalid environment variable values: ${fieldErrors.join(', ')}`;
  }
  
  // Fallback to original error message
  return zodError.message;
}