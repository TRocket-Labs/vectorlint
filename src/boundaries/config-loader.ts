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
  if (/\.(md|txt|mdx)$/i.test(last)) return true;
  if (/(^|\*)md$/i.test(last)) return true;
  if (/(^|\*)txt$/i.test(last)) return true;
  if (/(^|\*)mdx$/i.test(last)) return true;
  return false;
}

enum ConfigKey {
  RULES_PATH = 'RulesPath',
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

  let rulesPathRaw: string | undefined;
  let scanPathsRaw: string[] | undefined;
  let concurrencyRaw: number | undefined;
  let defaultSeverityRaw: string | undefined;
  const rawConfigObj: Record<string, unknown> = {};

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
      if (!m || !m[1]) continue;

      const key = m[1];
      const val = m[2] || '';
      const stripQuotes = (str: string): string =>
        str.replace(/^"|"$/g, '').replace(/^'|'$/g, '');

      if (currentSection) {
        // It's a property in a section
        const section = rawConfigObj[currentSection];
        if (typeof section === 'object' && section !== null && !Array.isArray(section)) {
          (section as Record<string, unknown>)[key] = stripQuotes(val);
        }
      } else {
        // Global property - process config keys
        switch (key) {
          case ConfigKey.RULES_PATH as string:
            rulesPathRaw = stripQuotes(val);
            break;
          case ConfigKey.SCAN_PATHS as string:
            throw new ConfigError('Old ScanPaths=[...] syntax no longer supported. Use [pattern] sections instead.');
          case ConfigKey.CONCURRENCY as string: {
            const parsed = parseInt(val, 10);
            if (Number.isNaN(parsed)) {
              throw new ConfigError(`Invalid Concurrency value: ${val}`);
            }
            concurrencyRaw = parsed;
            break;
          }
          case ConfigKey.DEFAULT_SEVERITY as string:
            defaultSeverityRaw = stripQuotes(val);
            break;
        }
      }
    }
  } catch (e: unknown) {
    const err = handleUnknownError(e, 'Reading config file');
    throw new ConfigError(`Failed to read config file: ${err.message}`);
  }

  // Validate required fields
  if (!rulesPathRaw) {
    throw new ConfigError('RulesPath is required in config file');
  }

  const scanPaths = new FileSectionParser().parseSections(rawConfigObj);

  if (!scanPaths || scanPaths.length === 0) {
    throw new ConfigError('At least one [pattern] path is required in config file');
  }

  // Validate scan path patterns
  for (const pattern of scanPaths) {
    if (!isSupportedPattern(pattern.pattern)) {
      throw new ConfigError(`Only .md, .txt, and .mdx are supported in ScanPaths. Invalid pattern: ${pattern.pattern}`);
    }
  }

  // Resolve paths
  const rulesPath = path.isAbsolute(rulesPathRaw)
    ? rulesPathRaw
    : path.resolve(configDir, rulesPathRaw);

  const concurrency = concurrencyRaw ?? 4;

  // Create config object and validate with schema
  // Create config object and validate with schema
  const configData = {
    rulesPath,
    scanPaths,
    concurrency,
    configDir,
    defaultSeverity: defaultSeverityRaw,
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
