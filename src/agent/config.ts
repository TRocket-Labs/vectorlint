import { existsSync, readFileSync } from 'fs';
import { parse } from 'smol-toml';
import { z } from 'zod';
import { getGlobalConfigPath } from '../config/global-config';

const DEFAULT_MAX_RETRIES = 10;
const MAX_AGENT_RETRIES = 25;

const AGENT_CONFIG_SCHEMA = z.object({
  agent: z
    .object({
      maxRetries: z.coerce.number().int().min(1).max(MAX_AGENT_RETRIES).optional(),
    })
    .optional(),
});

export interface AgentRuntimeConfig {
  maxRetries: number;
}

export function loadAgentRuntimeConfig(): AgentRuntimeConfig {
  const fallback: AgentRuntimeConfig = { maxRetries: DEFAULT_MAX_RETRIES };
  try {
    const configPath = getGlobalConfigPath();
    if (!existsSync(configPath)) {
      return fallback;
    }
    const raw = readFileSync(configPath, 'utf8');
    const parsed = AGENT_CONFIG_SCHEMA.parse(parse(raw));
    return {
      maxRetries: parsed.agent?.maxRetries ?? fallback.maxRetries,
    };
  } catch {
    return fallback;
  }
}
