import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import * as path from 'path';
import type { CacheData, CachedResult } from './types';

/**
 * Cache schema version. Bump this to invalidate existing caches
 * when the internal data structure changes in a future release.
 */
const CACHE_VERSION = 1;
const DEFAULT_CACHE_DIR = '.vectorlint';
const CACHE_FILENAME = 'cache.json';

/**
 * Persistent cache store for evaluation results.
 * Stores cache in .vectorlint/cache.json by default.
 */
export class CacheStore {
    private readonly cacheDir: string;
    private readonly cacheFile: string;
    private data: CacheData;
    private dirty: boolean = false;

    constructor(cwd: string = process.cwd(), cacheDir: string = DEFAULT_CACHE_DIR) {
        this.cacheDir = path.resolve(cwd, cacheDir);
        this.cacheFile = path.join(this.cacheDir, CACHE_FILENAME);
        this.data = this.load();
    }

    /**
     * Load cache from disk or create empty cache.
     */
    private load(): CacheData {
        try {
            if (existsSync(this.cacheFile)) {
                const raw = readFileSync(this.cacheFile, 'utf-8');
                const parsed = JSON.parse(raw) as CacheData;

                // Version check for future migrations
                if (parsed.version !== CACHE_VERSION) {
                    console.warn(`[vectorlint] Cache version mismatch, clearing cache`);
                    return { version: CACHE_VERSION, entries: {} };
                }

                return parsed;
            }
        } catch {
            // If cache is corrupted, start fresh
            console.warn(`[vectorlint] Could not read cache, starting fresh`);
        }

        return { version: CACHE_VERSION, entries: {} };
    }

    get(key: string): CachedResult | undefined {
        return this.data.entries[key];
    }

    set(key: string, result: CachedResult): void {
        this.data.entries[key] = result;
        this.dirty = true;
    }

    has(key: string): boolean {
        return key in this.data.entries;
    }

    clear(): void {
        this.data.entries = {};
        this.dirty = true;
    }

    size(): number {
        return Object.keys(this.data.entries).length;
    }

    save(): void {
        if (!this.dirty) return;

        try {
            // Create cache directory if missing
            if (!existsSync(this.cacheDir)) {
                mkdirSync(this.cacheDir, { recursive: true });
            }

            const json = JSON.stringify(this.data, null, 2);
            writeFileSync(this.cacheFile, json, 'utf-8');
            this.dirty = false;
        } catch (e) {
            // Don't fail the run if cache can't be written
            const msg = e instanceof Error ? e.message : String(e);
            console.warn(`[vectorlint] Warning: Could not save cache: ${msg}`);
        }
    }
}
