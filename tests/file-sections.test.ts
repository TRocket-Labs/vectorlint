import { describe, it, expect } from 'vitest';
import { FileSectionParser, type FilePatternConfig } from '../src/boundaries/file-section-parser.js';
import { FileSectionResolver } from '../src/boundaries/file-section-resolver.js';

describe('File-centric configuration (File Sections)', () => {
    const parser = new FileSectionParser();
    const resolver = new FileSectionResolver();

    describe('FileSectionParser', () => {
        it('parses single section with RunRules', () => {
            const config = {
                'docs/**/*.md': {
                    RunRules: 'VectorLint'
                }
            };

            const sections = parser.parseSections(config);

            expect(sections).toHaveLength(1);
            expect(sections[0].pattern).toBe('docs/**/*.md');
            expect(sections[0].runRules).toEqual(['VectorLint']);
            expect(sections[0].overrides).toEqual({});
        });

        it('parses comma-separated pack names', () => {
            const config = {
                'content/**/*.md': {
                    RunRules: 'VectorLint, CustomPack, BlogPack'
                }
            };

            const sections = parser.parseSections(config);

            expect(sections[0].runRules).toEqual(['VectorLint', 'CustomPack', 'BlogPack']);
        });

        it('parses empty RunRules as exclusion', () => {
            const config = {
                'archived/**/*.md': {
                    RunRules: ''
                }
            };

            const sections = parser.parseSections(config);

            expect(sections[0].runRules).toEqual([]);
        });

        it('extracts overrides from section', () => {
            const config = {
                'critical/**/*.md': {
                    RunRules: 'VectorLint',
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
                    runRules: ['VectorLint'],
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
                    runRules: ['BasePack'],
                    overrides: {}
                },
                {
                    pattern: '**/blog/*.md',
                    runRules: ['BlogPack'],
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
                    runRules: [],
                    overrides: { strictness: 7 }
                },
                {
                    pattern: 'docs/**/*.md',
                    runRules: [],
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
                    runRules: ['VectorLint'],
                    overrides: { strictness: 7 }
                },
                {
                    pattern: 'archived/**/*.md',
                    runRules: [], // Explicit exclusion
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
                    runRules: ['NonExistent', 'VectorLint', 'AlsoMissing'],
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
                    runRules: ['VectorLint'],
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
                    runRules: ['VectorLint'],
                    overrides: { 'technical-accuracy.strictness': 7 }
                },
                {
                    pattern: 'docs/api/**/*.md',
                    runRules: ['APIPack'],
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
