import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadPrompts } from '../src/prompts/prompt-loader';
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

    describe('Basic Evaluator', () => {
        it('should load basic prompt with criteria (no weight)', () => {
            createPrompt('test.md', `---
evaluator: basic
id: Test
name: Test Evaluator
criteria:
  - name: Quality
    id: QualityCheck
---
Check content.`);

            const { prompts, warnings } = loadPrompts(tmpDir);
            expect(warnings).toHaveLength(0);
            expect(prompts).toHaveLength(1);
            expect(prompts[0].meta.evaluator).toBe('basic');
            expect(prompts[0].meta.criteria).toHaveLength(1);
        });

        it('should load basic prompt without criteria', () => {
            createPrompt('test.md', `---
evaluator: basic
id: Test
name: Test Evaluator
---
Check content.`);

            const { prompts, warnings } = loadPrompts(tmpDir);
            expect(warnings).toHaveLength(0);
            expect(prompts).toHaveLength(1);
        });

        it('should reject basic prompt with weight in criteria', () => {
            createPrompt('test.md', `---
evaluator: basic
id: Test
name: Test Evaluator
criteria:
  - name: Quality
    id: QualityCheck
    weight: 1
---
Check content.`);

            const { prompts, warnings } = loadPrompts(tmpDir);
            expect(prompts).toHaveLength(0);
            expect(warnings.length).toBeGreaterThan(0);
            expect(warnings[0]).toContain("cannot have 'weight'");
        });

        it('should reject basic prompt missing id', () => {
            createPrompt('test.md', `---
evaluator: basic
name: Test Evaluator
---
Check content.`);

            const { prompts, warnings } = loadPrompts(tmpDir);
            expect(prompts).toHaveLength(0);
            expect(warnings.length).toBeGreaterThan(0);
            expect(warnings[0]).toContain('test.md');
        });

        it('should reject basic prompt missing name', () => {
            createPrompt('test.md', `---
evaluator: basic
id: Test
---
Check content.`);

            const { prompts, warnings } = loadPrompts(tmpDir);
            expect(prompts).toHaveLength(0);
            expect(warnings.length).toBeGreaterThan(0);
            expect(warnings[0]).toContain('test.md');
        });

        it('should reject basic prompt with criterion missing id', () => {
            createPrompt('test.md', `---
evaluator: basic
id: Test
name: Test Evaluator
criteria:
  - name: Quality
---
Check content.`);

            const { prompts, warnings } = loadPrompts(tmpDir);
            expect(prompts).toHaveLength(0);
            expect(warnings.length).toBeGreaterThan(0);
            expect(warnings[0]).toContain('test.md');
        });

        it('should reject basic prompt with criterion missing name', () => {
            createPrompt('test.md', `---
evaluator: basic
id: Test
name: Test Evaluator
criteria:
  - id: QualityCheck
---
Check content.`);

            const { prompts, warnings } = loadPrompts(tmpDir);
            expect(prompts).toHaveLength(0);
            expect(warnings.length).toBeGreaterThan(0);
            expect(warnings[0]).toContain('test.md');
        });
    });

    describe('Advanced Evaluator', () => {
        it('should reject advanced prompt without criteria', () => {
            createPrompt('test.md', `---
evaluator: base-llm
id: Test
name: Test Evaluator
---
Check content.`);

            const { prompts, warnings } = loadPrompts(tmpDir);
            expect(prompts).toHaveLength(0);
            expect(warnings.length).toBeGreaterThan(0);
            expect(warnings[0]).toContain('advanced evaluator requires criteria');
        });

        it('should reject advanced prompt without weight', () => {
            createPrompt('test.md', `---
evaluator: base-llm
id: Test
name: Test Evaluator
criteria:
  - name: Quality
    id: QualityCheck
---
Check content.`);

            const { prompts, warnings } = loadPrompts(tmpDir);
            expect(prompts).toHaveLength(0);
            expect(warnings.length).toBeGreaterThan(0);
            expect(warnings[0]).toContain("criterion missing required field 'weight'");
        });

        it('should load advanced prompt with valid criteria', () => {
            createPrompt('test.md', `---
evaluator: base-llm
id: Test
name: Test Evaluator
criteria:
  - name: Quality
    id: QualityCheck
    weight: 1
---
Check content.`);

            const { prompts, warnings } = loadPrompts(tmpDir);
            expect(warnings).toHaveLength(0);
            expect(prompts).toHaveLength(1);
            expect(prompts[0].meta.criteria).toHaveLength(1);
            expect(prompts[0].meta.criteria![0].weight).toBe(1);
        });
    });
});
