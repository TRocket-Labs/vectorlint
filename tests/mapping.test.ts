import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync } from 'fs';
import path from 'path';
import { tmpdir } from 'os';

// Expected API (prompt mapping):
// - readPromptMappingFromIni(iniPath): returns mapping object
// - resolvePromptMapping(filePath, promptId, mapping): boolean
import { readPromptMappingFromIni, resolvePromptMapping } from '../src/prompts/prompt-mapping.js';

function writeIni(dir: string, content: string) {
  const p = path.join(dir, 'vectorlint.ini');
  writeFileSync(p, content);
  return p;
}

describe('Prompt mapping (INI)', () => {
  it('applies prompt-level include/exclude over directory and defaults', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'vlint-'));
    const ini = `
[Prompts]
paths = ["Default:prompts", "Blog:prompts/blog"]

[Defaults]
include = ["**/*.md"]
exclude = ["archived/**"]

[Directory:Blog]
include = ["content/blog/**/*.md"]
exclude = ["content/blog/drafts/**"]

[Prompt:Headline]
include = ["content/blog/**/*.md"]
exclude = ["content/blog/drafts/**"]
`;
    const iniPath = writeIni(root, ini);
    const mapping = readPromptMappingFromIni(iniPath);
    // Included
    expect(resolvePromptMapping('content/blog/post.md', 'Headline', mapping, 'Blog')).toBe(true);
    // Excluded by prompt-level
    expect(resolvePromptMapping('content/blog/drafts/post.md', 'Headline', mapping, 'Blog')).toBe(false);
    // Defaults still apply to unrelated files; but Blog dir rules exclude drafts
    expect(resolvePromptMapping('content/blog/drafts/other.md', 'SomeOtherPrompt', mapping, 'Blog')).toBe(false);
  });

  it('falls back to directory rules when prompt rules absent, then to defaults', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'vlint-'));
    const ini = `
[Prompts]
paths = ["Default:prompts", "Guides:prompts/guides"]

[Defaults]
include = ["**/*.md"]
exclude = []

[Directory:Guides]
include = ["content/guides/**/*.md"]
exclude = []
`;
    const iniPath = writeIni(root, ini);
    const mapping = readPromptMappingFromIni(iniPath);
    // For a prompt from Guides dir, it should be included for guides content
    expect(resolvePromptMapping('content/guides/how-to.md', 'FromGuidesDir', mapping, 'Guides')).toBe(true);
    // A file outside guides still included by defaults (no directory or prompt rule)
    expect(resolvePromptMapping('docs/readme.md', 'AnyPrompt', mapping)).toBe(true);
  });

  it('union of excludes at all levels always wins against includes', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'vlint-'));
    const ini = `
[Prompts]
paths = ["Default:prompts", "Blog:prompts/blog"]

[Defaults]
include = ["**/*.md"]
exclude = ["archived/**"]

[Directory:Blog]
include = ["content/blog/**/*.md"]
exclude = ["content/blog/drafts/**"]

[Prompt:Headline]
include = ["content/blog/**/*.md"]
exclude = ["content/blog/drafts/**", "content/blog/hidden/**"]
`;
    const iniPath = writeIni(root, ini);
    const mapping = readPromptMappingFromIni(iniPath);
    // Excluded by defaults
    expect(resolvePromptMapping('archived/post.md', 'Headline', mapping)).toBe(false);
    // Excluded by directory
    expect(resolvePromptMapping('content/blog/drafts/post.md', 'Headline', mapping, 'Blog')).toBe(false);
    // Excluded by prompt-specific
    expect(resolvePromptMapping('content/blog/hidden/post.md', 'Headline', mapping, 'Blog')).toBe(false);
  });
});
