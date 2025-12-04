import { describe, it, expect } from 'vitest';
import { StyleGuideParser } from '../../src/style-guide/style-guide-parser';
import { StyleGuideFormat, RuleCategory } from '../../src/style-guide/types';
import {
    StyleGuideParseError,
    UnsupportedFormatError,
} from '../../src/errors/style-guide-errors';
import * as path from 'path';

describe('StyleGuideParser', () => {
    const fixturesDir = path.join(__dirname, 'fixtures');

    describe('Markdown parsing', () => {
        it('should parse markdown style guide', () => {
            const parser = new StyleGuideParser();
            const result = parser.parse(
                path.join(fixturesDir, 'sample-style-guide.md'),
                { format: StyleGuideFormat.MARKDOWN }
            );

            expect(result.data.name).toBe('Acme Corp Writing Style Guide');
            expect(result.data.rules.length).toBeGreaterThan(0);
        });

        it('should parse TinyRocket style guide (headers and bold text)', () => {
            const parser = new StyleGuideParser();
            const result = parser.parse(
                path.join(fixturesDir, 'tinyrocket-style-guide.md')
            );

            console.log(`[DEBUG] TinyRocket Rules Found: ${result.data.rules.length}`);
            result.data.rules.forEach(r => console.log(`[DEBUG] Rule: ${r.id} - ${r.description.substring(0, 50)}...`));

            // We expect this to fail initially or find very few rules
            expect(result.data.rules.length).toBeGreaterThan(5);
        });

        it('should extract rules from markdown sections', () => {
            const parser = new StyleGuideParser();
            const result = parser.parse(
                path.join(fixturesDir, 'sample-style-guide.md')
            );

            const rules = result.data.rules;
            expect(rules.length).toBeGreaterThan(10); // Should have multiple rules

            // Check that rules have required fields
            rules.forEach((rule) => {
                expect(rule.id).toBeDefined();
                expect(rule.category).toBeDefined();
                expect(rule.description).toBeDefined();
            });
        });

        it('should auto-categorize rules', () => {
            const parser = new StyleGuideParser();
            const result = parser.parse(
                path.join(fixturesDir, 'sample-style-guide.md')
            );

            const rules = result.data.rules;

            // Should have tone rules
            const toneRules = rules.filter((r) => r.category === RuleCategory.TONE);
            expect(toneRules.length).toBeGreaterThan(0);

            // Should have terminology rules
            const termRules = rules.filter(
                (r) => r.category === RuleCategory.TERMINOLOGY
            );
            expect(termRules.length).toBeGreaterThan(0);

            // Should have structure rules
            const structureRules = rules.filter(
                (r) => r.category === RuleCategory.STRUCTURE
            );
            expect(structureRules.length).toBeGreaterThan(0);
        });
    });

    describe('Format detection', () => {
        it('should auto-detect markdown format', () => {
            const parser = new StyleGuideParser();
            const result = parser.parse(
                path.join(fixturesDir, 'sample-style-guide.md')
            );

            expect(result.data.name).toBeDefined();
            expect(result.data.rules.length).toBeGreaterThan(0);
        });

        it('should throw error for unsupported format', () => {
            const parser = new StyleGuideParser();

            expect(() => {
                parser.parse(path.join(fixturesDir, 'invalid.txt'));
            }).toThrow(UnsupportedFormatError);
        });
    });

    describe('Error handling', () => {
        it('should throw error for non-existent file', () => {
            const parser = new StyleGuideParser();

            expect(() => {
                parser.parse(path.join(fixturesDir, 'non-existent.md'));
            }).toThrow(StyleGuideParseError);
        });
    });

    describe('Warnings', () => {
        it('should collect warnings during parsing', () => {
            const parser = new StyleGuideParser();
            const emptyMarkdown = '# Empty Style Guide\n\nNo rules here.';

            // Write temporary file
            const fs = require('fs');
            const tempFile = path.join(fixturesDir, 'empty-warnings.md');
            fs.writeFileSync(tempFile, emptyMarkdown);

            try {
                const result = parser.parse(tempFile);
                expect(result.warnings).toBeDefined();
                expect(Array.isArray(result.warnings)).toBe(true);
            } finally {
                if (fs.existsSync(tempFile)) {
                    fs.unlinkSync(tempFile);
                }
            }
        });

        it('should warn when no rules found', () => {
            const parser = new StyleGuideParser();
            const emptyMarkdown = '# Empty Style Guide\n\nNo rules here.';

            // Write temporary file
            const fs = require('fs');
            const tempFile = path.join(fixturesDir, 'empty-no-rules.md');
            fs.writeFileSync(tempFile, emptyMarkdown);

            try {
                const result = parser.parse(tempFile);
                expect(result.warnings.some((w) => w.includes('No rules found'))).toBe(
                    true
                );
            } finally {
                if (fs.existsSync(tempFile)) {
                    fs.unlinkSync(tempFile);
                }
            }
        });
    });

    describe('Rule ID generation', () => {
        it('should generate unique IDs for rules', () => {
            const parser = new StyleGuideParser();
            const result = parser.parse(
                path.join(fixturesDir, 'sample-style-guide.md')
            );

            const ids = result.data.rules.map((r) => r.id);
            const uniqueIds = new Set(ids);

            expect(ids.length).toBe(uniqueIds.size); // All IDs should be unique
        });

        it('should generate readable IDs from descriptions', () => {
            const parser = new StyleGuideParser();
            const result = parser.parse(
                path.join(fixturesDir, 'sample-style-guide.md')
            );

            result.data.rules.forEach((rule) => {
                expect(rule.id).toMatch(/^rule-[a-z0-9-]+$/);
            });
        });
    });
});
