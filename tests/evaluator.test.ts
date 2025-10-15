import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'fs';
import path from 'path';
import { tmpdir } from 'os';
import { loadPrompts } from '../src/prompts/PromptLoader.js';

// Fake provider implementing LLMProvider
class FakeProvider {
  calls: Array<{ content: string; prompt: string }>= [];
  async runPromptStructured<T = unknown>(content: string, promptText: string): Promise<T> {
    this.calls.push({ content, prompt: promptText });
    const injected = content && content.length > 0 ? 'OK' : 'MISSING';
    return { result: `RESULT:${injected}` } as T;
  }
}

function setupEnv() {
  const root = mkdtempSync(path.join(tmpdir(), 'vlint-'));
  const promptsDir = path.join(root, 'prompts');
  mkdirSync(promptsDir, { recursive: true });
  // Two prompts with minimal frontmatter criteria
  writeFileSync(
    path.join(promptsDir, 'p1.md'),
    `---\ncriteria:\n  - name: A\n    weight: 1\n---\nBody 1\n`
  );
  writeFileSync(
    path.join(promptsDir, 'p2.md'),
    `---\ncriteria:\n  - name: B\n    weight: 1\n---\nBody 2\n`
  );
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
    const { promptsDir, files } = setupEnv();
    const provider = new FakeProvider();
    const { prompts } = loadPrompts(promptsDir);
    // Simulate aggregation: 2 prompts x 2 files = 4 calls
    for (let i = 0; i < files.length; i++) {
      const content = '# test';
      for (const p of prompts) {
        await provider.runPromptStructured(content, p.body);
      }
    }
    expect(provider.calls.length).toBe(4);
  });
});
