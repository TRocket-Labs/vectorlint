import { createHash } from 'crypto';
import type { PromptFile } from '../prompts/prompt-loader';

/**
 * Computes a SHA256 hash of normalized content.
 * Normalization: trims whitespace and normalizes line endings.
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
    // Sort prompts by id for consistent ordering
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
 * Format: filePath|contentHash|promptsHash
 */
export function createCacheKeyString(
    filePath: string,
    contentHash: string,
    promptsHash: string
): string {
    // Use | as separator since it's not valid in file paths
    return `${filePath}|${contentHash.substring(0, 16)}|${promptsHash.substring(0, 16)}`;
}
