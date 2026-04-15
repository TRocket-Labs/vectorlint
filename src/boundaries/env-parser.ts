import { z } from 'zod';
import { ENV_SCHEMA, OBSERVABILITY_BACKENDS, type EnvConfig } from '../schemas/env-schemas';
import { ValidationError, handleUnknownError } from '../errors/index';
import { ProviderType } from '../providers/provider-factory';

export function parseEnvironment(env: unknown = process.env): EnvConfig {
  try {
    return ENV_SCHEMA.parse(env);
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
    const allowedProviders = Object.values(ProviderType).map(value => `'${value}'`).join(', ');
    return `LLM_PROVIDER is required and must be one of ${allowedProviders}. Received: ${providerType ?? 'undefined'}`;
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

  if (envObj.OBSERVABILITY_BACKEND === OBSERVABILITY_BACKENDS[0]) {
    const langfuseFields = issues
      .filter((issue) =>
        issue.code === 'custom' &&
        issue.path.length > 0 &&
        ['LANGFUSE_PUBLIC_KEY', 'LANGFUSE_SECRET_KEY'].includes(String(issue.path[0]))
      )
      .map((issue) => issue.path.join('.'));
    const missingLangfuseFields = [...new Set(langfuseFields)];

    if (missingLangfuseFields.length > 0) {
      return `Missing required Langfuse observability environment variables: ${missingLangfuseFields.join(', ')}. When using OBSERVABILITY_BACKEND=langfuse, ensure LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY are set.`;
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
