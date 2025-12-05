import { describe, it, expect } from 'vitest';
import { FileSectionParser, type FilePatternConfig } from '../src/boundaries/file-section-parser.js';
import { ScanPathResolver } from '../src/boundaries/scan-path-resolver.js';
import { createFilePatternConfig } from './utils.js';

describe('File-centric configuration (File Sections)', () => {
    const parser = new FileSectionParser();
    const resolver = new ScanPathResolver();

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

    describe('ScanPathResolver', () => {
        it('matches file to single section', () => {
            const sections: FilePatternConfig[] = [
                createFilePatternConfig('docs/**/*.md', ['VectorLint'])
            ];

            const result = resolver.resolveEvaluationsForFile('docs/guide.md', sections);

            expect(result.packs).toEqual(['VectorLint']);
            expect(result.overrides).toEqual({});
        });

        it('last matching section wins for RunRules', () => {
            const sections: FilePatternConfig[] = [
                createFilePatternConfig('content/**/*.md', ['BasePack']),
                createFilePatternConfig('**/blog/*.md', ['BlogPack'])
            ];

            const result = resolver.resolveEvaluationsForFile('content/blog/post.md', sections);

            // Last match wins - only BlogPack
            expect(result.packs).toEqual(['BlogPack']);
        });

        it('later section overrides win', () => {
            const sections: FilePatternConfig[] = [
                createFilePatternConfig('**/*.md', undefined, { strictness: 7 }),
                createFilePatternConfig('docs/**/*.md', undefined, { strictness: 9 })
            ];

            const result = resolver.resolveEvaluationsForFile('docs/api.md', sections);

            expect(result.overrides.strictness).toBe(9);
        });

        it('explicit exclusion clears packs and overrides', () => {
            const sections: FilePatternConfig[] = [
                createFilePatternConfig('**/*.md', ['VectorLint'], { strictness: 7 }),
                createFilePatternConfig('archived/**/*.md', [])
            ];

            const result = resolver.resolveEvaluationsForFile('archived/old.md', sections);

            expect(result.packs).toEqual([]);
            expect(result.overrides).toEqual({});
        });

        it('filters non-existent packs when availablePacks provided', () => {
            const sections: FilePatternConfig[] = [
                createFilePatternConfig('**/*.md', ['NonExistent', 'VectorLint', 'AlsoMissing'])
            ];

            const result = resolver.resolveEvaluationsForFile(
                'test.md',
                sections,
                ['VectorLint'] // Only VectorLint exists
            );

            expect(result.packs).toEqual(['VectorLint']);
        });

        it('throws error when no sections match', () => {
            const sections: FilePatternConfig[] = [
                createFilePatternConfig('**/*.md', ['VectorLint'])
            ];

            expect(() => {
                resolver.resolveEvaluationsForFile('README.txt', sections);
            }).toThrow(/No configuration found for this path/);
        });
    });

    describe('Integration: Pattern priority and override merging', () => {
        it('applies prompts with overrides based on file path patterns', () => {
            const sections: FilePatternConfig[] = [
                createFilePatternConfig('**/*.md', ['VectorLint'], { 'technical-accuracy.strictness': 7 }),
                createFilePatternConfig('docs/api/**/*.md', ['APIPack'], { 'technical-accuracy.strictness': 9 })
            ];

            const result = resolver.resolveEvaluationsForFile('docs/api/users.md', sections);

            // Last match wins for RunRules
            expect(result.packs).toEqual(['APIPack']);
            expect(result.overrides['technical-accuracy.strictness']).toBe(9); // Later wins
        });
    });
});
