import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, existsSync } from 'fs';
import * as path from 'path';
import { hashContent, hashPrompts, createCacheKeyString } from '../src/cache/content-hasher';
import { CacheStore } from '../src/cache/cache-store';
import type { PromptFile } from '../src/prompts/prompt-loader';
import type { CachedResult } from '../src/cache/types';

describe('Content Hasher', () => {
    describe('hashContent', () => {
        it('produces consistent hashes for same content', () => {
            const content = 'Hello, World!';
            const hash1 = hashContent(content);
            const hash2 = hashContent(content);
            expect(hash1).toBe(hash2);
        });

        it('normalizes line endings', () => {
            const contentCRLF = 'Line 1\r\nLine 2';
            const contentLF = 'Line 1\nLine 2';
            expect(hashContent(contentCRLF)).toBe(hashContent(contentLF));
        });

        it('trims whitespace', () => {
            const content1 = '  Hello  ';
            const content2 = 'Hello';
            expect(hashContent(content1)).toBe(hashContent(content2));
        });

        it('produces different hashes for different content', () => {
            const hash1 = hashContent('Content A');
            const hash2 = hashContent('Content B');
            expect(hash1).not.toBe(hash2);
        });
    });

    describe('hashPrompts', () => {
        const createMockPrompt = (id: string, body: string): PromptFile => ({
            id,
            filename: `${id}.md`,
            fullPath: `/path/to/${id}.md`,
            meta: {
                id,
                name: `Test ${id}`,
            },
            body,
            pack: 'TestPack',
        });

        it('produces consistent hashes for same prompts', () => {
            const prompts = [createMockPrompt('rule1', 'Body 1')];
            const hash1 = hashPrompts(prompts);
            const hash2 = hashPrompts(prompts);
            expect(hash1).toBe(hash2);
        });

        it('produces same hash regardless of prompt order', () => {
            const prompt1 = createMockPrompt('a-rule', 'Body A');
            const prompt2 = createMockPrompt('b-rule', 'Body B');

            const hash1 = hashPrompts([prompt1, prompt2]);
            const hash2 = hashPrompts([prompt2, prompt1]);
            expect(hash1).toBe(hash2);
        });

        it('produces different hash when prompt body changes', () => {
            const v1 = [createMockPrompt('rule1', 'Original body')];
            const v2 = [createMockPrompt('rule1', 'Modified body')];

            expect(hashPrompts(v1)).not.toBe(hashPrompts(v2));
        });

        it('produces different hash when prompt meta changes', () => {
            const v1: PromptFile[] = [{
                id: 'rule1',
                filename: 'rule1.md',
                fullPath: '/path/rule1.md',
                meta: { id: 'rule1', name: 'Rule One' },
                body: 'Same body',
            }];
            const v2: PromptFile[] = [{
                id: 'rule1',
                filename: 'rule1.md',
                fullPath: '/path/rule1.md',
                meta: { id: 'rule1', name: 'Rule One Modified' },
                body: 'Same body',
            }];

            expect(hashPrompts(v1)).not.toBe(hashPrompts(v2));
        });
    });

    describe('createCacheKeyString', () => {
        it('creates a key with truncated hashes', () => {
            const key = createCacheKeyString(
                'path/to/file.md',
                'abc123def456ghi789jkl012mno345pqr678',
                'xyz987wvu654tsr321qpo098nml765kji432'
            );
            expect(key).toBe('path/to/file.md|abc123def456ghi7|xyz987wvu654tsr3');
        });
    });
});

describe('CacheStore', () => {
    const testDir = path.join(__dirname, 'fixtures', 'cache-test');
    const cacheDir = '.test-vectorlint';

    beforeEach(() => {
        // Ensure test directory exists
        if (!existsSync(testDir)) {
            mkdirSync(testDir, { recursive: true });
        }
        // Clean up any existing test cache
        const fullCacheDir = path.join(testDir, cacheDir);
        if (existsSync(fullCacheDir)) {
            rmSync(fullCacheDir, { recursive: true });
        }
    });

    afterEach(() => {
        // Clean up test cache
        const fullCacheDir = path.join(testDir, cacheDir);
        if (existsSync(fullCacheDir)) {
            rmSync(fullCacheDir, { recursive: true });
        }
    });

    it('returns undefined for missing keys', () => {
        const store = new CacheStore(testDir, cacheDir);
        expect(store.get('nonexistent-key')).toBeUndefined();
    });

    it('stores and retrieves results', () => {
        const store = new CacheStore(testDir, cacheDir);
        const result: CachedResult = {
            errors: 2,
            warnings: 1,
            hadOperationalErrors: false,
            hadSeverityErrors: true,
            requestFailures: 0,
            timestamp: Date.now(),
        };

        store.set('test-key', result);
        const retrieved = store.get('test-key');

        expect(retrieved).toBeDefined();
        expect(retrieved?.errors).toBe(2);
        expect(retrieved?.warnings).toBe(1);
        expect(retrieved?.hadSeverityErrors).toBe(true);
    });

    it('persists cache to disk', () => {
        const store1 = new CacheStore(testDir, cacheDir);
        const result: CachedResult = {
            errors: 1,
            warnings: 0,
            hadOperationalErrors: false,
            hadSeverityErrors: false,
            requestFailures: 0,
            timestamp: Date.now(),
        };

        store1.set('persistent-key', result);
        store1.save();

        // Create new store instance to load from disk
        const store2 = new CacheStore(testDir, cacheDir);
        const retrieved = store2.get('persistent-key');

        expect(retrieved).toBeDefined();
        expect(retrieved?.errors).toBe(1);
    });

    it('creates cache directory if missing', () => {
        const store = new CacheStore(testDir, cacheDir);
        store.set('key', {
            errors: 0,
            warnings: 0,
            hadOperationalErrors: false,
            hadSeverityErrors: false,
            requestFailures: 0,
            timestamp: Date.now(),
        });
        store.save();

        const fullCacheDir = path.join(testDir, cacheDir);
        expect(existsSync(fullCacheDir)).toBe(true);
        expect(existsSync(path.join(fullCacheDir, 'cache.json'))).toBe(true);
    });

    it('clears all entries', () => {
        const store = new CacheStore(testDir, cacheDir);
        store.set('key1', {
            errors: 0,
            warnings: 0,
            hadOperationalErrors: false,
            hadSeverityErrors: false,
            requestFailures: 0,
            timestamp: Date.now(),
        });
        store.set('key2', {
            errors: 0,
            warnings: 0,
            hadOperationalErrors: false,
            hadSeverityErrors: false,
            requestFailures: 0,
            timestamp: Date.now(),
        });

        expect(store.size()).toBe(2);
        store.clear();
        expect(store.size()).toBe(0);
    });

    it('reports correct size', () => {
        const store = new CacheStore(testDir, cacheDir);
        expect(store.size()).toBe(0);

        store.set('key1', {
            errors: 0,
            warnings: 0,
            hadOperationalErrors: false,
            hadSeverityErrors: false,
            requestFailures: 0,
            timestamp: Date.now(),
        });
        expect(store.size()).toBe(1);

        store.set('key2', {
            errors: 0,
            warnings: 0,
            hadOperationalErrors: false,
            hadSeverityErrors: false,
            requestFailures: 0,
            timestamp: Date.now(),
        });
        expect(store.size()).toBe(2);
    });

    it('checks key existence with has()', () => {
        const store = new CacheStore(testDir, cacheDir);
        expect(store.has('missing')).toBe(false);

        store.set('exists', {
            errors: 0,
            warnings: 0,
            hadOperationalErrors: false,
            hadSeverityErrors: false,
            requestFailures: 0,
            timestamp: Date.now(),
        });
        expect(store.has('exists')).toBe(true);
    });
});
