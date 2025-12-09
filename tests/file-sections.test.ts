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

            const result = resolver.resolveConfiguration('docs/guide.md', sections);

            expect(result.packs).toEqual(['VectorLint']);
            expect(result.overrides).toEqual({});
        });

        it('last matching section wins for RunRules', () => {
            const sections: FilePatternConfig[] = [
                createFilePatternConfig('content/**/*.md', ['BasePack']),
                createFilePatternConfig('content/blog/*.md', ['BlogPack'])
            ];

            const result = resolver.resolveConfiguration('content/blog/post.md', sections);

            // Cascading: BlogPack applies on top of BasePack
            expect(result.packs).toEqual(['BasePack', 'BlogPack']);
        });

        it('later section overrides win', () => {
            const sections: FilePatternConfig[] = [
                createFilePatternConfig('**/*.md', undefined, { strictness: 7 }),
                createFilePatternConfig('docs/**/*.md', undefined, { strictness: 9 })
            ];

            const result = resolver.resolveConfiguration('docs/api.md', sections);

            expect(result.overrides.strictness).toBe(9);
        });

        it('explicit empty list inherits base packs (Additive)', () => {
            const sections: FilePatternConfig[] = [
                createFilePatternConfig('**/*.md', ['VectorLint'], { strictness: 7 }),
                createFilePatternConfig('archived/**/*.md', [])
            ];

            const result = resolver.resolveConfiguration('archived/old.md', sections);

            // Additive: RunRules are merged (Union). Empty list adds nothing, but doesn't clear.
            expect(result.packs).toEqual(['VectorLint']);
            // Overrides are also inherited.
            expect(result.overrides).toEqual({ strictness: 7 });
        });

        it('filters non-existent packs when availablePacks provided', () => {
            const sections: FilePatternConfig[] = [
                createFilePatternConfig('**/*.md', ['NonExistent', 'VectorLint', 'AlsoMissing'])
            ];

            const result = resolver.resolveConfiguration(
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
                resolver.resolveConfiguration('README.txt', sections);
            }).toThrow(/No configuration found for this path/);
        });
    });

    describe('Integration: Pattern priority and override merging', () => {
        it('applies prompts with overrides based on file path patterns', () => {
            const sections: FilePatternConfig[] = [
                createFilePatternConfig('**/*.md', ['VectorLint'], { 'technical-accuracy.strictness': 7 }),
                createFilePatternConfig('docs/api/**/*.md', ['APIPack'], { 'technical-accuracy.strictness': 9 })
            ];

            const result = resolver.resolveConfiguration('docs/api/users.md', sections);

            // Cascading: APIPack applies on top of VectorLint
            expect(result.packs).toEqual(['VectorLint', 'APIPack']);
            expect(result.overrides['technical-accuracy.strictness']).toBe(9); // Later wins
        });
    });
});
