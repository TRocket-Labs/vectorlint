export function splitIntoWords(text: string): string[] {
  return text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
}

export function countWords(text: string): number {
  return splitIntoWords(text).length;
}
