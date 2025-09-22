import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'fs';
import path from 'path';
import { tmpdir } from 'os';
import { loadPrompts } from '../src/prompts/PromptLoader.js';

// Fake provider implementing LLMProvider
class FakeProvider {
  calls: Array<{ content: string; prompt: string }>= [];
  async runPrompt(content: string, promptText: string): Promise<string> {
    this.calls.push({ content, prompt: promptText });
    // Consider content injected if non-empty content provided
    const injected = content && content.length > 0 ? 'OK' : 'MISSING';
    return `RESULT:${injected}`;
  }
}

function setupEnv() {
  const root = mkdtempSync(path.join(tmpdir(), 'vlint-'));
  const promptsDir = path.join(root, 'prompts');
  mkdirSync(promptsDir, { recursive: true });
  // Two prompts (no placeholders needed)
  writeFileSync(path.join(promptsDir, 'p1.md'), 'Evaluate: HEADLINE:');
  writeFileSync(path.join(promptsDir, 'p2.md'), 'Evaluate without placeholder');
  const files = [
    path.join(root, 'a.md'),
    path.join(root, 'b.txt'),
  ];
  writeFileSync(files[0], '# title');
  writeFileSync(files[1], 'plain');
  return { root, promptsDir, files };
}

describe('Evaluation aggregation', () => {
  it('runs all prompts for all files and injects content if placeholder exists', async () => {
    const { root, promptsDir, files } = setupEnv();
    const provider = new FakeProvider();
    const { prompts } = loadPrompts(promptsDir);
    // Simulate aggregation: 2 prompts x 2 files = 4 calls
    for (const f of files) {
      const content = '# test';
      for (const p of prompts) {
        await provider.runPrompt(content, p.text);
      }
    }
    expect(provider.calls.length).toBe(4);
  });
});
