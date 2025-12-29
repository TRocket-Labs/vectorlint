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

/**
 * Strips line numbers from content that was previously numbered.
 * Removes the leading "123\t" pattern from each line.
 *
 * @param content - Line-numbered content
 * @returns Original content without line numbers
 */
export function stripLineNumbers(content: string): string {
  return content
    .split("\n")
    .map((line) => line.replace(/^\d+\t/, ""))
    .join("\n");
}

/**
 * Gets a specific line's content from text (1-indexed).
 *
 * @param text - Full text content
 * @param lineNumber - 1-indexed line number
 * @returns The content of that line, or empty string if out of bounds
 */
export function getLineContent(text: string, lineNumber: number): string {
  const lines = text.split("\n");
  if (lineNumber < 1 || lineNumber > lines.length) {
    return "";
  }
  return lines[lineNumber - 1] || "";
}

/**
 * Gets the character index where a specific line starts (0-indexed).
 *
 * @param text - Full text content
 * @param lineNumber - 1-indexed line number
 * @returns The character index where the line starts
 */
export function getLineStartIndex(text: string, lineNumber: number): number {
  const lines = text.split("\n");
  let index = 0;
  for (let i = 0; i < lineNumber - 1 && i < lines.length; i++) {
    index += (lines[i]?.length || 0) + 1; // +1 for newline
  }
  return index;
}
