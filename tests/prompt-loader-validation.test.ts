import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadRules } from '../src/rules/rule-loader';
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
id: Test
name: Test Evaluator
criteria:
  - name: Quality
    id: QualityCheck
---
Check content.`);

            const { rules, warnings } = loadRules(tmpDir);
            expect(warnings).toHaveLength(0);
            expect(rules).toHaveLength(1);
            expect(rules[0].meta.criteria).toHaveLength(1);
        });

        it('should load base prompt without criteria', () => {
            createPrompt('test.md', `---
id: Test
name: Test Evaluator
---
Check content.`);

            const { rules, warnings } = loadRules(tmpDir);
            expect(warnings).toHaveLength(0);
            expect(rules).toHaveLength(1);
        });

        it('should load base prompt with weight in criteria', () => {
            createPrompt('test.md', `---
id: Test
name: Test Evaluator
criteria:
  - name: Quality
    id: QualityCheck
    weight: 1
---
Check content.`);

            const { rules, warnings } = loadRules(tmpDir);
            expect(warnings).toHaveLength(0);
            expect(rules).toHaveLength(1);
            expect(rules[0].meta.criteria![0].weight).toBe(1);
        });

        it('should reject base prompt missing id', () => {
            createPrompt('test.md', `---
name: Test Evaluator
---
Check content.`);

            const { rules, warnings } = loadRules(tmpDir);
            expect(rules).toHaveLength(0);
            expect(warnings.length).toBeGreaterThan(0);
            expect(warnings[0]).toContain('test.md');
        });

        it('should reject base prompt missing name', () => {
            createPrompt('test.md', `---
id: Test
---
Check content.`);

            const { rules, warnings } = loadRules(tmpDir);
            expect(rules).toHaveLength(0);
            expect(warnings.length).toBeGreaterThan(0);
            expect(warnings[0]).toContain('test.md');
        });

        it('should reject base prompt with criterion missing id', () => {
            createPrompt('test.md', `---
id: Test
name: Test Evaluator
criteria:
  - name: Quality
---
Check content.`);

            const { rules, warnings } = loadRules(tmpDir);
            expect(rules).toHaveLength(0);
            expect(warnings.length).toBeGreaterThan(0);
            expect(warnings[0]).toContain('test.md');
        });

        it('should reject base prompt with criterion missing name', () => {
            createPrompt('test.md', `---
id: Test
name: Test Evaluator
criteria:
  - id: QualityCheck
---
Check content.`);

            const { rules, warnings } = loadRules(tmpDir);
            expect(rules).toHaveLength(0);
            expect(warnings.length).toBeGreaterThan(0);
            expect(warnings[0]).toContain('test.md');
        });
    });
});
