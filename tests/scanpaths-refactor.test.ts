import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import { ScanPathResolver } from '../src/boundaries/scan-path-resolver';
import { resolveTargets } from '../src/scan/file-resolver';
import { loadConfig } from '../src/boundaries/config-loader';
import { createFilePatternConfig } from './utils.js';

// Mock dependencies
vi.mock('fast-glob', () => ({
    default: {
        sync: vi.fn((patterns: string[]) => {
            // Mock file system based on patterns
            const results: string[] = [];
            const p = patterns.map(p => p.replace(/\\/g, '/'));

            if (p.some(x => x.endsWith('content/**/*.md'))) {
                results.push('content/blog/post.md', 'content/docs/api.md');
            }
            if (p.some(x => x.endsWith('content/blog/**/*.md'))) {
                results.push('content/blog/post.md');
            }
            if (p.some(x => x.endsWith('docs/api/**/*.md'))) {
                results.push('docs/api/endpoints.md');
            }
            // Only match generic **/*.md if it's NOT one of the specific ones above, 
            // OR if the user explicitly requested **/*.md (which would be a shorter string ending in **/*.md)
            // But here we are checking if ANY pattern matches.
            // If the pattern is EXACTLY ending in /**/*.md and NOT /content/**/*.md etc.
            if (p.some(x => x.endsWith('/**/*.md') && !x.includes('content/') && !x.includes('docs/') && !x.includes('drafts/'))) {
                results.push('content/blog/post.md', 'docs/api/endpoints.md', 'other/readme.md');
            }
            if (p.some(x => x.endsWith('drafts/**/*.md'))) {
                results.push('drafts/wip.md');
            }

            return [...new Set(results)].map(f => path.resolve(process.cwd(), f));
        })
    }
}));

vi.mock('fs', async () => {
    const actual = await vi.importActual<typeof import('fs')>('fs');
    return {
        ...actual,
        existsSync: vi.fn(() => true),
        statSync: vi.fn((p) => ({
            isDirectory: () => !p.toString().endsWith('.md'),
            isFile: () => p.toString().endsWith('.md')
        })),
        readFileSync: vi.fn(() => '')
    };
});

describe('ScanPaths Refactor', () => {
    const cwd = process.cwd();
    const configDir = cwd;

    describe('ScanPathResolver', () => {
        let resolver: ScanPathResolver;

        beforeEach(() => {
            resolver = new ScanPathResolver();
        });

        it('should resolve packs based on matching pattern', () => {
            const scanPaths = [
                createFilePatternConfig('content/**/*.md', ['VectorLint'])
            ];

            const result = resolver.resolveConfiguration('content/blog/post.md', scanPaths);
            expect(result.packs).toEqual(['VectorLint']);
        });

        it('should apply most specific pattern (Specific > General) regardless of order', () => {
            // General defined AFTER specific
            const scanPaths = [
                createFilePatternConfig('content/blog/**/*.md', ['Marketing']),
                createFilePatternConfig('content/**/*.md', ['VectorLint'])
            ];

            // Cascading: General is merged with Specific
            // content/blog/**/*.md (Marketing) + content/**/*.md (VectorLint)
            const result = resolver.resolveConfiguration('content/blog/post.md', scanPaths);
            expect(result.packs).toEqual(expect.arrayContaining(['VectorLint', 'Marketing']));
        });

        it('should merge duplicate patterns (Cascading)', () => {
            const scanPaths = [
                createFilePatternConfig('content/blog/**/*.md', ['First']),
                createFilePatternConfig('content/blog/**/*.md', ['Second'])
            ];

            // Tie in specificity -> Both apply and merge
            const result = resolver.resolveConfiguration('content/blog/post.md', scanPaths);
            expect(result.packs).toEqual(['First', 'Second']);
        });

        it('should merge overrides (Cascading Configuration)', () => {
            const scanPaths = [
                // General: strictness 5
                createFilePatternConfig('**/*.md', ['VectorLint'], { 'Grammar.strictness': 5 }),
                // Specific: enabled=true
                createFilePatternConfig('docs/**/*.md', ['Technical'], { 'Technical.enabled': true })
            ];

            // Specific path matches both. 
            // Result should contain BOTH overrides.
            const result = resolver.resolveConfiguration('docs/api.md', scanPaths);
            expect(result.packs).toEqual(expect.arrayContaining(['VectorLint', 'Technical']));

            expect(result.overrides).toEqual({
                'Grammar.strictness': 5,
                'Technical.enabled': true
            });
        });

        it('should inherit packs if specific rule has empty RunRules', () => {
            const scanPaths = [
                createFilePatternConfig('**/*.md', ['VectorLint']),
                createFilePatternConfig('drafts/**/*.md', [])
            ];

            // Cascading: Inherits 'VectorLint' from base, adds nothing from specific.
            const result = resolver.resolveConfiguration('drafts/wip.md', scanPaths);
            expect(result.packs).toEqual(['VectorLint']);
        });

        it('should throw error when file matches NO pattern', () => {
            const scanPaths = [
                createFilePatternConfig('content/**/*.md', ['VectorLint'])
            ];

            expect(() => {
                resolver.resolveConfiguration('other/readme.md', scanPaths);
            }).toThrow(/No configuration found for this path/);
        });
    });

    describe('File Discovery (resolveTargets)', () => {
        it('should discover files from scanPaths patterns', () => {
            const scanPaths = [
                createFilePatternConfig('content/**/*.md', ['VectorLint'])
            ];

            const files = resolveTargets({
                cliArgs: [],
                cwd,
                rulesPath: '.github/rules',
                scanPaths,
                configDir
            });

            expect(files).toContain(path.resolve(cwd, 'content/blog/post.md'));
            expect(files).toContain(path.resolve(cwd, 'content/docs/api.md'));
            expect(files).not.toContain(path.resolve(cwd, 'other/readme.md'));
        });
    });

    describe('Config Loader (Legacy Support)', () => {
        it('should throw error for old ScanPaths syntax', () => {
            const iniContent = `
        RulesPath=.github/rules
        ScanPaths=[content/**/*.md]
      `;

            vi.mocked(fs.readFileSync).mockReturnValue(iniContent);

            expect(() => {
                loadConfig(cwd, 'vectorlint.ini');
            }).toThrow(/Old ScanPaths=\[\.\.\.\] syntax no longer supported/);
        });
    });
});
