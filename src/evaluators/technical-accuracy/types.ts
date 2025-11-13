/**
 * Type definitions for technical accuracy evaluation pipeline
 */

/**
 * A factual claim extracted from content that requires verification
 */
export interface Claim {
  text: string;   // The exact claim text
  line: number;   // Line number where claim appears
  type: 'factual' | 'statistical' | 'technical';  // Claim category
}

/**
 * An optimized search query generated for a claim
 */
export interface SearchQuery {
  claim: string;  // Original claim text
  query: string;  // Optimized search query
}
