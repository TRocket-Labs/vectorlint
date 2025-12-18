export interface Chunk {
  content: string;
  startOffset: number;
  endOffset: number;
  index: number;
  context?: string; // Optional header/context from parent sections
}

export interface ChunkingOptions {
  maxChunkSize?: number; // Maximum words per chunk
  overlapFraction?: number; // Fraction of overlap between chunks (default: 0.1 = 10%)
  preserveSentences?: boolean; // Avoid breaking mid-sentence
}

export interface ChunkingStrategy {
  readonly name: string;
  chunk(content: string, options?: ChunkingOptions): Chunk[];
}
