import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'fs';
import path from 'path';
import { tmpdir } from 'os';
import { loadPrompts } from '../src/prompts/prompt-loader.js';
import { checkTarget } from '../src/prompts/target.js';

function setupPrompt(yaml: string) {
  const root = mkdtempSync(path.join(tmpdir(), 'vlint-'));
  const promptsDir = path.join(root, 'prompts');
  mkdirSync(promptsDir, { recursive: true });
  writeFileSync(path.join(promptsDir, 'p.md'), `---\n${yaml}\n---\nBody`);
  const { prompts } = loadPrompts(promptsDir);
  return { root, promptsDir, prompt: prompts[0] };
}

describe('Target gating (regex)', () => {
  it('global target: missing match with required=true yields deterministic error', () => {
    const yaml = [
      "target:",
      "  regex: '^#\\s+(.+)$'",
      "  flags: 'mu'",
      "  group: 1",
      "  required: true",
      "  suggestion: Add an H1 headline.",
      "criteria:",
      "  - name: A",
      "    id: A",
      "    weight: 1",
    ].join('\n');
    const { prompt } = setupPrompt(yaml);
    const content = 'No heading here';
    const c = prompt.meta.criteria[0];
    const res = checkTarget(content, prompt.meta.target, c.target);
    expect(res.missing).toBe(true);
    expect(res.suggestion).toMatch(/H1/);
  });

  it('global target: present match passes gating', () => {
    const yaml = [
      "target:",
      "  regex: '^#\\s+(.+)$'",
      "  flags: 'mu'",
      "  required: true",
      "criteria:",
      "  - name: A",
      "    id: A",
      "    weight: 1",
    ].join('\n');
    const { prompt } = setupPrompt(yaml);
    const content = '# Title\n\nBody';
    const c = prompt.meta.criteria[0];
    const res = checkTarget(content, prompt.meta.target, c.target);
    expect(res.missing).toBe(false);
  });

  it('criterion target overrides global target', () => {
    const yaml = [
      "target:",
      "  regex: '^#\\s+(.+)$'",
      "  flags: 'mu'",
      "  required: true",
      "criteria:",
      "  - name: A",
      "    id: A",
      "    weight: 1",
      "    target:",
      "      regex: '^##\\s+(.+)$'",
      "      flags: 'mu'",
      "      required: true",
      "      suggestion: Add an H2.",
    ].join('\n');
    const { prompt } = setupPrompt(yaml);
    const content = '# H1 only';
    const c = prompt.meta.criteria[0];
    const res = checkTarget(content, prompt.meta.target, c.target);
    expect(res.missing).toBe(true);
    expect(res.suggestion).toMatch(/H2/);
  });

  it('invalid regex with required=true yields missing', () => {
    const yaml = [
      "target:",
      "  regex: '[unterminated'",
      "  flags: 'mu'",
      "  required: true",
      "criteria:",
      "  - name: A",
      "    id: A",
      "    weight: 1",
    ].join('\n');
    const { prompt } = setupPrompt(yaml);
    const content = '# Title';
    const c = prompt.meta.criteria[0];
    const res = checkTarget(content, prompt.meta.target, c.target);
    expect(res.missing).toBe(true);
  });
});
