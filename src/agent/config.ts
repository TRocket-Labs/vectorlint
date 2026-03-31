import { existsSync, readFileSync } from 'fs';
import { parse } from 'smol-toml';
import { z } from 'zod';
import { getGlobalConfigPath } from '../config/global-config';

const AGENT_CONFIG_SCHEMA = z.object({
  agent: z
    .object({
      maxRetries: z.coerce.number().int().min(1).optional(),
    })
    .optional(),
});

export interface AgentRuntimeConfig {
  maxRetries: number;
}

export function loadAgentRuntimeConfig(): AgentRuntimeConfig {
  const fallback: AgentRuntimeConfig = { maxRetries: 10 };
  const configPath = getGlobalConfigPath();
  if (!existsSync(configPath)) {
    return fallback;
  }

  try {
    const raw = readFileSync(configPath, 'utf8');
    const parsed = AGENT_CONFIG_SCHEMA.parse(parse(raw));
    return {
      maxRetries: parsed.agent?.maxRetries ?? fallback.maxRetries,
    };
  } catch {
    return fallback;
  }
}
