import { existsSync, readFileSync } from 'fs';
import * as path from 'path';
import { CONFIG_SCHEMA, type Config } from '../schemas/config-schemas';
import { ConfigError, ValidationError, handleUnknownError } from '../errors/index';
import { DEFAULT_CONFIG_FILENAME } from '../config/constants';
import { FileSectionParser } from './file-section-parser';

function parseBracketList(value: string): string[] {
  const v = value.trim();
  const m = v.match(/^\[(.*)\]$/);
  if (!m || !m[1]) return [];
  const inner = m[1];
  return inner
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((s) => s.replace(/^"|"$/g, '').replace(/^'|'$/g, ''));
}

function isSupportedPattern(p: string): boolean {
  const last = p.split(/[\\/]/).pop() || p;
  if (/\.(md|txt)$/i.test(last)) return true;
  if (/(^|\*)md$/i.test(last)) return true;
  if (/(^|\*)txt$/i.test(last)) return true;
  return false;
}

enum ConfigKey {
  PROMPTS_PATH = 'PromptsPath',
  SCAN_PATHS = 'ScanPaths',
  CONCURRENCY = 'Concurrency',
  DEFAULT_SEVERITY = 'DefaultSeverity',
}

/**
 * Load and validate configuration from vectorlint.ini file	
 */
export function loadConfig(cwd: string = process.cwd(), configPath?: string): Config {
  const iniPath = configPath
    ? path.resolve(cwd, configPath)
    : path.resolve(cwd, DEFAULT_CONFIG_FILENAME);

  if (!existsSync(iniPath)) {
    throw new ConfigError(`Missing configuration file at ${iniPath}`);
  }

  const configDir = path.dirname(iniPath);

  let promptsPathRaw: string | undefined;
  let scanPathsRaw: string[] | undefined;
  let concurrencyRaw: number | undefined;
  let defaultSeverityRaw: string | undefined;
  let rawConfigObj: Record<string, any> = {};

  // Utility function to strip surrounding quotes (both single and double)
  const stripQuotes = (str: string): string =>
    str.replace(/^"|"$/g, '').replace(/^'|'$/g, '');

  try {
    const raw = readFileSync(iniPath, 'utf-8');
    let currentSection: string | null = null;

    for (const rawLine of raw.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#') || line.startsWith(';')) continue;

      // Section header
      const sectionMatch = line.match(/^\[(.*)\]$/);
      if (sectionMatch && sectionMatch[1]) {
        currentSection = sectionMatch[1];
        if (!rawConfigObj[currentSection]) {
          rawConfigObj[currentSection] = {};
        }
        continue;
      }

      const m = line.match(/^([A-Za-z0-9_.-]+)\s*=\s*(.*)$/);
      if (!m || !m[1] || !m[2]) continue;

      const key = m[1];
      const val = m[2];
      const stripQuotes = (str: string): string =>
        str.replace(/^"|"$/g, '').replace(/^'|'$/g, '');

      if (currentSection) {
        // It's a property in a section
        rawConfigObj[currentSection][key] = stripQuotes(val);
      } else {
        // Global property - process config keys
        switch (key) {
          case ConfigKey.PROMPTS_PATH as string:
            promptsPathRaw = stripQuotes(val);
            break;
          case ConfigKey.SCAN_PATHS as string:
            scanPathsRaw = parseBracketList(val);
            break;
          case ConfigKey.CONCURRENCY as string: {
            const n = Number(stripQuotes(val));
            if (Number.isFinite(n) && n > 0) concurrencyRaw = Math.floor(n);
            break;
          }
          case ConfigKey.DEFAULT_SEVERITY as string:
            defaultSeverityRaw = stripQuotes(val).toLowerCase();
            break;
        }
      }
    }
  } catch (e: unknown) {
    const err = handleUnknownError(e, 'Reading config file');
    throw new ConfigError(`Failed to read config file: ${err.message}`);
  }

  // Validate required fields
  if (!promptsPathRaw) {
    throw new ConfigError('PromptsPath is required in config file');
  }
  if (!scanPathsRaw || scanPathsRaw.length === 0) {
    throw new ConfigError('ScanPaths is required in config file');
  }

  // Validate scan path patterns
  for (const pattern of scanPathsRaw) {
    if (!isSupportedPattern(pattern)) {
      throw new ConfigError(`Only .md and .txt are supported in ScanPaths. Invalid pattern: ${pattern}`);
    }
  }

  // Resolve paths
  const promptsPath = path.isAbsolute(promptsPathRaw)
    ? promptsPathRaw
    : path.resolve(configDir, promptsPathRaw);

  const concurrency = concurrencyRaw ?? 4;

  // Create config object and validate with schema
  const configData = {
    promptsPath,
    scanPaths: scanPathsRaw,
    concurrency,
    configDir,
    defaultSeverity: defaultSeverityRaw,
    fileSections: new FileSectionParser().parseSections(rawConfigObj),
  };

  try {
    return CONFIG_SCHEMA.parse(configData);
  } catch (e: unknown) {
    if (e instanceof Error && 'issues' in e) {
      // Zod error
      throw new ValidationError(`Invalid configuration: ${e.message}`);
    }
    const err = handleUnknownError(e, 'Config validation');
    throw new ConfigError(`Configuration validation failed: ${err.message}`);
  }
}
