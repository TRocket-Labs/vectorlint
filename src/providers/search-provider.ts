/*
 * Search provider interface for fact verification and research.
 * Implementations query external search APIs and return results.
 */
export interface SearchProvider {
  search(query: string): Promise<unknown>;
}
