export function splitIntoWords(text: string): string[] {
  return text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
}

export function countWords(text: string): number {
  // Strip line number prefixes (e.g., "42\t") before counting
  // This ensures accurate word count for line-numbered content
  const cleanText = text.replace(/^\d+\t/gm, "");
  return splitIntoWords(cleanText).length;
}
