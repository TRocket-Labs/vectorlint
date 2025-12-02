import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync } from 'fs';
import path from 'path';
import { tmpdir } from 'os';
import { FileSectionParser, type FilePatternConfig } from '../src/boundaries/file-section-parser.js';
import { FileSectionResolver } from '../src/boundaries/file-section-resolver.js';

function createTempDir(): string {
    return mkdtempSync(path.join(tmpdir(), 'vlint-'));
}

function writeIni(dir: string, content: string): string {
    const p = path.join(dir, 'vectorlint.ini');
    writeFileSync(p, content);
    return p;
}

describe('File-centric configuration (File Sections)', () => {
    const parser = new FileSectionParser();
    const resolver = new FileSectionResolver();

    describe('FileSectionParser', () => {
        it('parses single section with RunEvals', () => {
            const config = {
                'docs/**/*.md': {
                    RunEvals: 'VectorLint'
                }
            };

            const sections = parser.parseSections(config);

            expect(sections).toHaveLength(1);
            expect(sections[0].pattern).toBe('docs/**/*.md');
            expect(sections[0].runEvals).toEqual(['VectorLint']);
            expect(sections[0].overrides).toEqual({});
        });

        it('parses comma-separated pack names', () => {
            const config = {
                'content/**/*.md': {
                    RunEvals: 'VectorLint, CustomPack, BlogPack'
                }
            };

            const sections = parser.parseSections(config);

            expect(sections[0].runEvals).toEqual(['VectorLint', 'CustomPack', 'BlogPack']);
        });

        it('parses empty RunEvals as exclusion', () => {
            const config = {
                'archived/**/*.md': {
                    RunEvals: ''
                }
            };

            const sections = parser.parseSections(config);

            expect(sections[0].runEvals).toEqual([]);
        });

        it('extracts overrides from section', () => {
            const config = {
                'critical/**/*.md': {
                    RunEvals: 'VectorLint',
                    'technical-accuracy.strictness': '9',
                    'readability.severity': 'error'
                }
            };

            const sections = parser.parseSections(config);

            expect(sections[0].overrides).toEqual({
                'technical-accuracy.strictness': '9',
                'readability.severity': 'error'
            });
        });
    });

    describe('FileSectionResolver', () => {
        it('matches file to single section', () => {
            const sections: FilePatternConfig[] = [
                {
                    pattern: 'docs/**/*.md',
                    runEvals: ['VectorLint'],
                    overrides: {}
                }
            ];

            const result = resolver.resolveEvaluationsForFile('docs/guide.md', sections);

            expect(result.packs).toEqual(['VectorLint']);
            expect(result.overrides).toEqual({});
        });

        it('merges packs from multiple matching sections', () => {
            const sections: FilePatternConfig[] = [
                {
                    pattern: 'content/**/*.md',
                    runEvals: ['BasePack'],
                    overrides: {}
                },
                {
                    pattern: '**/blog/*.md',
                    runEvals: ['BlogPack'],
                    overrides: {}
                }
            ];

            const result = resolver.resolveEvaluationsForFile('content/blog/post.md', sections);

            expect(result.packs).toContain('BasePack');
            expect(result.packs).toContain('BlogPack');
            expect(result.packs).toHaveLength(2);
        });

        it('later section overrides win', () => {
            const sections: FilePatternConfig[] = [
                {
                    pattern: '**/*.md',
                    runEvals: [],
                    overrides: { strictness: 7 }
                },
                {
                    pattern: 'docs/**/*.md',
                    runEvals: [],
                    overrides: { strictness: 9 }
                }
            ];

            const result = resolver.resolveEvaluationsForFile('docs/api.md', sections);

            expect(result.overrides.strictness).toBe(9);
        });

        it('explicit exclusion clears packs and overrides', () => {
            const sections: FilePatternConfig[] = [
                {
                    pattern: '**/*.md',
                    runEvals: ['VectorLint'],
                    overrides: { strictness: 7 }
                },
                {
                    pattern: 'archived/**/*.md',
                    runEvals: [], // Explicit exclusion
                    overrides: {}
                }
            ];

            const result = resolver.resolveEvaluationsForFile('archived/old.md', sections);

            expect(result.packs).toEqual([]);
            expect(result.overrides).toEqual({});
        });

        it('filters non-existent packs when availablePacks provided', () => {
            const sections: FilePatternConfig[] = [
                {
                    pattern: '**/*.md',
                    runEvals: ['NonExistent', 'VectorLint', 'AlsoMissing'],
                    overrides: {}
                }
            ];

            const result = resolver.resolveEvaluationsForFile(
                'test.md',
                sections,
                ['VectorLint'] // Only VectorLint exists
            );

            expect(result.packs).toEqual(['VectorLint']);
        });

        it('returns empty result when no sections match', () => {
            const sections: FilePatternConfig[] = [
                {
                    pattern: '**/*.md',
                    runEvals: ['VectorLint'],
                    overrides: {}
                }
            ];

            const result = resolver.resolveEvaluationsForFile('README.txt', sections);

            expect(result.packs).toEqual([]);
            expect(result.overrides).toEqual({});
        });
    });

    describe('Integration: Pattern priority and override merging', () => {
        it('applies prompts with overrides based on file path patterns', () => {
            const sections: FilePatternConfig[] = [
                {
                    pattern: '**/*.md',
                    runEvals: ['VectorLint'],
                    overrides: { 'technical-accuracy.strictness': 7 }
                },
                {
                    pattern: 'docs/api/**/*.md',
                    runEvals: ['APIPack'],
                    overrides: { 'technical-accuracy.strictness': 9 }
                }
            ];

            const result = resolver.resolveEvaluationsForFile('docs/api/users.md', sections);

            expect(result.packs).toContain('VectorLint');
            expect(result.packs).toContain('APIPack');
            expect(result.overrides['technical-accuracy.strictness']).toBe(9); // Later wins
        });
    });
});
