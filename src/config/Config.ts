import { existsSync, readFileSync } from 'fs';
import path from 'path';

export interface Config {
  promptsPath: string;
  scanPaths: string[];
}

function parseBracketList(value: string): string[] {
  const v = value.trim();
  const m = v.match(/^\[(.*)\]$/);
  if (!m) return [];
  const inner = m[1];
  return inner
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((s) => s.replace(/^\"|\"$/g, '').replace(/^'|'$/g, ''));
}

function isSupportedPattern(p: string): boolean {
  const last = p.split(/[\\/]/).pop() || p;
  if (/\.(md|txt)$/i.test(last)) return true;
  if (/(^|\*)md$/i.test(last)) return true;
  if (/(^|\*)txt$/i.test(last)) return true;
  return false;
}

export function loadConfig(cwd: string = process.cwd()): Config {
  const iniPath = path.resolve(cwd, 'vectorlint.ini');
  if (!existsSync(iniPath)) {
    throw new Error('Missing vectorlint.ini in project root. Please create one with PromptsPath and ScanPaths.');
  }

  let promptsPathRaw: string | undefined;
  let scanPathsRaw: string[] | undefined;
  const raw = readFileSync(iniPath, 'utf-8');
  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || line.startsWith(';')) continue;
    const m = line.match(/^([A-Za-z][A-Za-z0-9]*)\s*=\s*(.*)$/);
    if (!m) continue;
    const key = m[1];
    const val = m[2];
    if (key === 'PromptsPath') {
      promptsPathRaw = val.replace(/^\"|\"$/g, '').replace(/^'|'$/g, '');
    } else if (key === 'ScanPaths') {
      scanPathsRaw = parseBracketList(val);
    }
  }

  if (!promptsPathRaw) {
    throw new Error('PromptsPath is required in vectorlint.ini');
  }
  if (!scanPathsRaw || scanPathsRaw.length === 0) {
    throw new Error('ScanPaths is required in vectorlint.ini');
  }

  for (const pattern of scanPathsRaw) {
    if (!isSupportedPattern(pattern)) {
      throw new Error(`Only .md and .txt are supported in ScanPaths. Invalid pattern: ${pattern}`);
    }
  }

  const promptsPath = path.isAbsolute(promptsPathRaw)
    ? promptsPathRaw
    : path.resolve(cwd, promptsPathRaw);

  return { promptsPath, scanPaths: scanPathsRaw };
}
