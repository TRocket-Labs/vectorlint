export interface QuotedTextEvidence {
  quoted_text: string;
  context_before?: string;
  context_after?: string;
}

export interface Location {
  line: number; // 1-based
  column: number; // 1-based
}

export interface LocationWithMatch {
  line: number; // 1-based
  column: number; // 1-based
  match: string; // extracted text between pre and post
}

function computeLineCol(text: string, index: number): Location {
  let line = 1;
  let lastBreak = -1;
  for (let i = 0; i < index; i++) {
    // char code for '\n'
    if (text.charCodeAt(i) === 10) {
      line++;
      lastBreak = i;
    }
  }
  const column = index - lastBreak;
  return { line, column };
}

// Simple Levenshtein distance calculator for fuzzy matching
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0]![j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i]![j] = matrix[i - 1]![j - 1]!;
      } else {
        matrix[i]![j] = Math.min(
          matrix[i - 1]![j - 1]! + 1, // substitution
          matrix[i]![j - 1]! + 1, // insertion
          matrix[i - 1]![j]! + 1 // deletion
        );
      }
    }
  }

  return matrix[b.length]![a.length]!;
}

/**
 * Locates text using hybrid evidence: quoted_text + optional context_before/after.
 * Algorithm:
 * 1. Find all exact matches of quoted_text
 * 2. If multiple matches, use context to disambiguate
 * 3. If no exact match, try fuzzy matching (Levenshtein distance <= 3)
 * 4. Return null if no match found
 */
export function locateQuotedText(
  text: string,
  ev: QuotedTextEvidence
): LocationWithMatch | null {
  const quotedText = ev.quoted_text;
  const contextBefore = ev.context_before || "";
  const contextAfter = ev.context_after || "";

  if (!quotedText) return null;

  // Find all occurrences of quoted_text
  const matches: Array<{ index: number; match: string }> = [];
  let searchFrom = 0;

  while (true) {
    const idx = text.indexOf(quotedText, searchFrom);
    if (idx === -1) break;
    matches.push({ index: idx, match: quotedText });
    searchFrom = idx + 1;
  }

  // If we found exact matches
  if (matches.length > 0) {
    // Single match - return it
    if (matches.length === 1) {
      const loc = computeLineCol(text, matches[0]!.index);
      return { ...loc, match: matches[0]!.match };
    }

    // Multiple matches - use context to disambiguate
    if (contextBefore || contextAfter) {
      for (const match of matches) {
        const beforeIdx = match.index - contextBefore.length;
        const afterIdx = match.index + quotedText.length;

        const actualBefore =
          beforeIdx >= 0 ? text.substring(beforeIdx, match.index) : "";
        const actualAfter = text.substring(
          afterIdx,
          afterIdx + contextAfter.length
        );

        const beforeMatches = !contextBefore || actualBefore === contextBefore;
        const afterMatches = !contextAfter || actualAfter === contextAfter;

        if (beforeMatches && afterMatches) {
          const loc = computeLineCol(text, match.index);
          return { ...loc, match: match.match };
        }
      }
    }

    // Context didn't help, return first match
    const loc = computeLineCol(text, matches[0]!.index);
    return { ...loc, match: matches[0]!.match };
  }

  // No exact match - try substring matching first (LLM may have added/removed words)
  // Split quoted text into key phrases and search for them
  const words = quotedText.split(/\s+/);
  if (words.length >= 3) {
    // Try progressively smaller substrings of the quoted text
    for (let len = words.length - 1; len >= 3; len--) {
      for (let start = 0; start <= words.length - len; start++) {
        const substring = words.slice(start, start + len).join(" ");
        const idx = text.indexOf(substring);
        if (idx !== -1) {
          const loc = computeLineCol(text, idx);
          return { ...loc, match: substring };
        }
      }
    }
  }

  // Try case-insensitive matching
  const lowerText = text.toLowerCase();
  const lowerQuoted = quotedText.toLowerCase();
  const caseInsensitiveIdx = lowerText.indexOf(lowerQuoted);
  if (caseInsensitiveIdx !== -1) {
    const loc = computeLineCol(text, caseInsensitiveIdx);
    return {
      ...loc,
      match: text.substring(
        caseInsensitiveIdx,
        caseInsensitiveIdx + quotedText.length
      ),
    };
  }

  // Last resort - fuzzy matching on individual words
  let bestMatch: { index: number; match: string; distance: number } | null =
    null;

  let currentIndex = 0;
  for (const word of text.split(/\s+/)) {
    const distance = levenshteinDistance(
      quotedText.toLowerCase(),
      word.toLowerCase()
    );
    if (distance <= 3 && (!bestMatch || distance < bestMatch.distance)) {
      const idx = text.indexOf(word, currentIndex);
      if (idx !== -1) {
        bestMatch = { index: idx, match: word, distance };
      }
    }
    currentIndex = text.indexOf(word, currentIndex) + word.length;
  }

  if (bestMatch) {
    const loc = computeLineCol(text, bestMatch.index);
    return { ...loc, match: bestMatch.match };
  }

  return null;
}
