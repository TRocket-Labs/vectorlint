import * as YAML from 'yaml';
import { PROMPT_META_SCHEMA, type PromptMeta } from '../schemas/prompt-schemas';
import { ValidationError, ProcessingError, handleUnknownError } from '../errors/index';

export function parseYamlFrontmatter(yamlContent: string): PromptMeta {
  let raw: unknown;
  
  try {
    raw = YAML.parse(yamlContent) || {};
  } catch (e: unknown) {
    const err = handleUnknownError(e, 'YAML parsing');
    throw new ProcessingError(`Failed to parse YAML: ${err.message}`);
  }

  try {
    return PROMPT_META_SCHEMA.parse(raw);
  } catch (e: unknown) {
    if (e instanceof Error && 'issues' in e) {
      // Zod error
      throw new ValidationError(`Invalid YAML frontmatter: ${e.message}`);
    }
    const err = handleUnknownError(e, 'YAML validation');
    throw new ValidationError(`YAML validation failed: ${err.message}`);
  }
}
