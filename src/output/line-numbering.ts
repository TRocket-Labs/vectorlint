/**
 * Utilities for adding and removing line numbers from content.
 * Used to give LLMs deterministic line numbers instead of asking them to count.
 */

/**
 * Prepends line numbers to each line of content.
 * Format: "1\tFirst line\n2\tSecond line..."
 *
 * @param content - Raw text content
 * @returns Content with line numbers prepended (tab-separated)
 */
export function prependLineNumbers(content: string): string {
  return content
    .split("\n")
    .map((line, i) => `${i + 1}\t${line}`)
    .join("\n");
}
