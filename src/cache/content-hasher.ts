import { createHash } from 'crypto';
import type { PromptFile } from '../prompts/prompt-loader';

const HASH_TRUNCATE_LENGTH = 16;

/**
 * Computes a SHA256 hash of normalized content.
 * 
 * Normalization rationale:
 * - Line endings (\r\n -> \n): Ensures consistent hashing across Windows/Unix.
 * - Trim whitespace: Trailing whitespace is irrelevant for content quality.
 * 
 * IMPORTANT: Changing normalization invalidates ALL cache entries.
 */
export function hashContent(content: string): string {
    const normalized = content.replace(/\r\n/g, '\n').trim();
    return createHash('sha256').update(normalized, 'utf8').digest('hex');
}

/**
 * Computes a SHA256 hash of prompt configurations.
 * This includes prompt id, meta, and body to detect rule changes.
 */
export function hashPrompts(prompts: PromptFile[]): string {
    // Sort prompts by id for deterministic hashing.
    const sorted = [...prompts].sort((a, b) => a.id.localeCompare(b.id));

    // Extract hashable parts: id, meta (serialized), and body
    const parts = sorted.map(p => ({
        id: p.id,
        meta: JSON.stringify(p.meta),
        body: p.body.trim(),
        pack: p.pack || '',
    }));

    const serialized = JSON.stringify(parts);
    return createHash('sha256').update(serialized, 'utf8').digest('hex');
}

/**
 * Creates a cache key string from components.
 * Format: "filePath|contentHash(16)|promptsHash(16)"
 */
export function createCacheKeyString(
    filePath: string,
    contentHash: string,
    promptsHash: string
): string {
    return `${filePath}|${contentHash.substring(0, HASH_TRUNCATE_LENGTH)}|${promptsHash.substring(0, HASH_TRUNCATE_LENGTH)}`;
}
