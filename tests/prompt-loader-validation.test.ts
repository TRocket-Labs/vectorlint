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

    describe('Base Evaluator', () => {
        it('should load base prompt with criteria (optional weight)', () => {
            createPrompt('test.md', `---
evaluator: base
id: Test
name: Test Evaluator
criteria:
  - name: Quality
    id: QualityCheck
---
Check content.`);

            const { prompts, warnings } = loadRules(tmpDir);
            expect(warnings).toHaveLength(0);
            expect(prompts).toHaveLength(1);
            expect(prompts[0].meta.evaluator).toBe('base');
            expect(prompts[0].meta.criteria).toHaveLength(1);
        });

        it('should load base prompt without criteria', () => {
            createPrompt('test.md', `---
evaluator: base
id: Test
name: Test Evaluator
---
Check content.`);

            const { prompts, warnings } = loadRules(tmpDir);
            expect(warnings).toHaveLength(0);
            expect(prompts).toHaveLength(1);
        });

        it('should load base prompt with weight in criteria', () => {
            createPrompt('test.md', `---
evaluator: base
id: Test
name: Test Evaluator
criteria:
  - name: Quality
    id: QualityCheck
    weight: 1
---
Check content.`);

            const { prompts, warnings } = loadRules(tmpDir);
            expect(warnings).toHaveLength(0);
            expect(prompts).toHaveLength(1);
            expect(prompts[0].meta.criteria![0].weight).toBe(1);
        });

        it('should reject base prompt missing id', () => {
            createPrompt('test.md', `---
evaluator: base
name: Test Evaluator
---
Check content.`);

            const { prompts, warnings } = loadRules(tmpDir);
            expect(prompts).toHaveLength(0);
            expect(warnings.length).toBeGreaterThan(0);
            expect(warnings[0]).toContain('test.md');
        });

        it('should reject base prompt missing name', () => {
            createPrompt('test.md', `---
evaluator: base
id: Test
---
Check content.`);

            const { prompts, warnings } = loadRules(tmpDir);
            expect(prompts).toHaveLength(0);
            expect(warnings.length).toBeGreaterThan(0);
            expect(warnings[0]).toContain('test.md');
        });

        it('should reject base prompt with criterion missing id', () => {
            createPrompt('test.md', `---
evaluator: base
id: Test
name: Test Evaluator
criteria:
  - name: Quality
---
Check content.`);

            const { prompts, warnings } = loadRules(tmpDir);
            expect(prompts).toHaveLength(0);
            expect(warnings.length).toBeGreaterThan(0);
            expect(warnings[0]).toContain('test.md');
        });

        it('should reject base prompt with criterion missing name', () => {
            createPrompt('test.md', `---
evaluator: base
id: Test
name: Test Evaluator
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
});
