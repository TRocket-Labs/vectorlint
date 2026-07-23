import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadRules } from '../src/prompts/prompt-loader';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('Prompt Loader Validation', () => {
    let tmpDir: string;

    const createPrompt = (filename: string, content: string) => {
        const promptPath = path.join(tmpDir, filename);
        fs.writeFileSync(promptPath, content);
    };

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vectorlint-test-'));
    });

    afterEach(() => {
        if (tmpDir) {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        }
    });

    describe('rule frontmatter', () => {
        it('should load a rule with criteria', () => {
            createPrompt('test.md', `---
id: Test
name: Test Rule
criteria:
  - name: Quality
    id: QualityCheck
---
Check content.`);

            const { prompts, warnings } = loadRules(tmpDir);
            expect(warnings).toHaveLength(0);
            expect(prompts).toHaveLength(1);
            expect(prompts[0].meta.criteria).toHaveLength(1);
        });

        it('should load a rule without criteria', () => {
            createPrompt('test.md', `---
id: Test
name: Test Rule
---
Check content.`);

            const { prompts, warnings } = loadRules(tmpDir);
            expect(warnings).toHaveLength(0);
            expect(prompts).toHaveLength(1);
        });

        it('should reject a rule missing id', () => {
            createPrompt('test.md', `---
name: Test Rule
---
Check content.`);

            const { prompts, warnings } = loadRules(tmpDir);
            expect(prompts).toHaveLength(0);
            expect(warnings.length).toBeGreaterThan(0);
            expect(warnings[0]).toContain('test.md');
        });

        it('should reject a rule missing name', () => {
            createPrompt('test.md', `---
id: Test
---
Check content.`);

            const { prompts, warnings } = loadRules(tmpDir);
            expect(prompts).toHaveLength(0);
            expect(warnings.length).toBeGreaterThan(0);
            expect(warnings[0]).toContain('test.md');
        });

        it('should reject a rule with criterion missing id', () => {
            createPrompt('test.md', `---
id: Test
name: Test Rule
criteria:
  - name: Quality
---
Check content.`);

            const { prompts, warnings } = loadRules(tmpDir);
            expect(prompts).toHaveLength(0);
            expect(warnings.length).toBeGreaterThan(0);
            expect(warnings[0]).toContain('test.md');
        });

        it('should reject a rule with criterion missing name', () => {
            createPrompt('test.md', `---
id: Test
name: Test Rule
criteria:
  - id: QualityCheck
---
Check content.`);

            const { prompts, warnings } = loadRules(tmpDir);
            expect(prompts).toHaveLength(0);
            expect(warnings.length).toBeGreaterThan(0);
            expect(warnings[0]).toContain('test.md');
        });
    });

    describe('ignored frontmatter', () => {
        it('ignores a supplied type field', () => {
            createPrompt('test.md', `---
id: Test
name: Test Prompt
type: unused
---
Check content.`);

            const { prompts, warnings } = loadRules(tmpDir);
            expect(warnings).toHaveLength(0);
            expect(prompts).toHaveLength(1);
            expect(prompts[0].meta).not.toHaveProperty('type');
        });
    });
});
