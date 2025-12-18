import { Chunk, ChunkingOptions, ChunkingStrategy } from "./types";
import { countWords, splitIntoWords } from "./utils";

const DEFAULT_OPTIONS: Required<ChunkingOptions> = {
  maxChunkSize: 500,
  overlapFraction: 0.1,
  preserveSentences: true,
};

export class RecursiveChunker implements ChunkingStrategy {
  readonly name = "recursive";

  private readonly separators = ["\n\n", "\n", ". ", " "];

  chunk(content: string, options?: ChunkingOptions): Chunk[] {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const rawChunks = this.recursiveChunk(content, opts.maxChunkSize, 0);

    // Assign indices and calculate offsets
    const chunks: Chunk[] = [];
    let currentOffset = 0;

    for (let i = 0; i < rawChunks.length; i++) {
      const chunkContent = rawChunks[i];
      if (!chunkContent) continue;

      // Find this chunk in original content
      const startOffset = content.indexOf(chunkContent, currentOffset);
      const endOffset = startOffset + chunkContent.length;

      chunks.push({
        content: chunkContent,
        startOffset: startOffset >= 0 ? startOffset : currentOffset,
        endOffset:
          startOffset >= 0 ? endOffset : currentOffset + chunkContent.length,
        index: i,
      });

      currentOffset =
        startOffset >= 0 ? endOffset : currentOffset + chunkContent.length;
    }

    return chunks;
  }

  private recursiveChunk(
    text: string,
    maxSize: number,
    separatorIndex: number
  ): string[] {
    const trimmed = text.trim();

    // Base case: small enough
    if (countWords(trimmed) <= maxSize) {
      return trimmed ? [trimmed] : [];
    }

    // Try splitting by current separator
    const separator = this.separators[separatorIndex];
    if (!separator || !trimmed.includes(separator)) {
      // No more separators or separator not found, use next one
      if (separatorIndex < this.separators.length - 1) {
        return this.recursiveChunk(trimmed, maxSize, separatorIndex + 1);
      }
      // Fallback: force split by word count
      return this.forceSplit(trimmed, maxSize);
    }

    const parts = trimmed.split(separator);
    const chunks: string[] = [];
    let currentChunk = "";

    for (const part of parts) {
      const testChunk = currentChunk ? currentChunk + separator + part : part;

      if (countWords(testChunk) <= maxSize) {
        currentChunk = testChunk;
      } else {
        // Save current chunk and start new one
        if (currentChunk) {
          chunks.push(currentChunk.trim());
        }
        currentChunk = part;
      }
    }

    // Add final chunk
    if (currentChunk) {
      chunks.push(currentChunk.trim());
    }

    // Recursively process any chunks still too large
    const finalChunks: string[] = [];
    for (const chunk of chunks) {
      if (countWords(chunk) > maxSize) {
        finalChunks.push(
          ...this.recursiveChunk(chunk, maxSize, separatorIndex + 1)
        );
      } else if (chunk) {
        finalChunks.push(chunk);
      }
    }

    return finalChunks;
  }

  private forceSplit(text: string, maxSize: number): string[] {
    const words = splitIntoWords(text);
    const chunks: string[] = [];

    for (let i = 0; i < words.length; i += maxSize) {
      const chunkWords = words.slice(i, i + maxSize);
      chunks.push(chunkWords.join(" "));
    }

    return chunks;
  }
}
