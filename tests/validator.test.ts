import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'fs';
import path from 'path';
import { tmpdir } from 'os';
import { loadRules } from '../src/prompts/prompt-loader.js';
import { validateAll } from '../src/prompts/prompt-validator.js';

function writePrompt(dir: string, name: string, yaml: string, body = 'Body') {
  const full = path.join(dir, name);
  writeFileSync(full, `---\n${yaml}\n---\n${body}`);
}

describe('PromptValidator', () => {
  it('passes a valid prompt', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'vlint-'));
    const promptsDir = path.join(root, 'prompts');
    mkdirSync(promptsDir, { recursive: true });
    const yaml = [
      'id: TestPrompt',
      'name: Test Prompt',
      "severity: error",
      'criteria:',
      '  - name: A',
      '    id: A',
      '  - name: B',
      '    id: B',
    ].join('\n');
    writePrompt(promptsDir, 'ok.md', yaml);
    const { prompts } = loadRules(promptsDir);
    const res = validateAll(prompts);
    expect(res.errors.length).toBe(0);
  });

  it('errors on invalid flags/regex', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'vlint-'));
    const promptsDir = path.join(root, 'prompts');
    mkdirSync(promptsDir, { recursive: true });
    const yaml = [
      'id: TestPrompt',
      'name: Test Prompt',
      'severity: error',
      'target:',
      "  regex: '[unterminated'", // invalid regex
      "  flags: 'mz'", // z invalid
      'criteria:',
      '  - name: A',
      '    id: A',
    ].join('\n');
    writePrompt(promptsDir, 'bad.md', yaml);
    const { prompts } = loadRules(promptsDir);
    const res = validateAll(prompts);
    expect(res.errors.some(e => /Invalid regex flags/i.test(e.message))).toBe(true);
    expect(res.errors.some(e => /Invalid global target\.regex/i.test(e.message))).toBe(true);
  });

  it('validates regex with the default execution flags', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'vlint-'));
    const promptsDir = path.join(root, 'prompts');
    mkdirSync(promptsDir, { recursive: true });
    const yaml = [
      'id: TestPrompt',
      'name: Test Prompt',
      'target:',
      "  regex: '\\a'",
      'criteria:',
      '  - name: A',
      '    id: A',
    ].join('\n');
    writePrompt(promptsDir, 'bad-default-flags.md', yaml);

    const { prompts } = loadRules(promptsDir);
    const res = validateAll(prompts);

    expect(res.errors.some(e => /Invalid global target\.regex/i.test(e.message))).toBe(true);
  });
});
