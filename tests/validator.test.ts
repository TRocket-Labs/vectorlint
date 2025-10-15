import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'fs';
import path from 'path';
import { tmpdir } from 'os';
import { loadPrompts, type PromptFile } from '../src/prompts/PromptLoader.js';
import { validateAll, validatePrompt } from '../src/prompts/PromptValidator.js';

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
      'threshold: 4',
      "severity: error",
      'criteria:',
      '  - name: A',
      '    id: A',
      '    weight: 2',
      '  - name: B',
      '    id: B',
      '    weight: 2',
    ].join('\n');
    writePrompt(promptsDir, 'ok.md', yaml);
    const { prompts } = loadPrompts(promptsDir);
    const res = validateAll(prompts);
    expect(res.errors.length).toBe(0);
  });

  it('warns when threshold exceeds sum of weights', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'vlint-'));
    const promptsDir = path.join(root, 'prompts');
    mkdirSync(promptsDir, { recursive: true });
    const yaml = [
      'threshold: 10',
      'severity: warning',
      'criteria:',
      '  - name: A',
      '    id: A',
      '    weight: 2',
    ].join('\n');
    writePrompt(promptsDir, 'thr.md', yaml);
    const { prompts } = loadPrompts(promptsDir);
    const res = validateAll(prompts);
    expect(res.warnings.length).toBeGreaterThanOrEqual(1);
  });

  it('errors on invalid flags/regex', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'vlint-'));
    const promptsDir = path.join(root, 'prompts');
    mkdirSync(promptsDir, { recursive: true });
    const yaml = [
      'threshold: 2',
      'severity: error',
      'target:',
      "  regex: '[unterminated'", // invalid regex
      "  flags: 'mz'", // z invalid
      'criteria:',
      '  - name: A',
      '    id: A',
      '    weight: 2',
    ].join('\n');
    writePrompt(promptsDir, 'bad.md', yaml);
    const { prompts } = loadPrompts(promptsDir);
    const res = validateAll(prompts);
    expect(res.errors.some(e => /Invalid regex flags/i.test(e.message))).toBe(true);
    expect(res.errors.some(e => /Invalid global target\.regex/i.test(e.message))).toBe(true);
  });

  it('errors on invalid weights (manual prompt)', () => {
    const p: PromptFile = {
      id: 'x',
      filename: 'x.md',
      body: '',
      meta: {
        criteria: [
          { id: 'A', name: 'A', weight: 0 },
          { id: 'B', name: 'B', weight: -1 },
        ],
      },
    };
    const res = validatePrompt(p);
    const weightErrors = res.filter(e => /Invalid weight/i.test(e.message));
    expect(weightErrors.length).toBeGreaterThanOrEqual(2);
  });
});
