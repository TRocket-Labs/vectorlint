import { partial_ratio, token_sort_ratio, ratio } from "fuzzball";

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
  match: string; // extracted text
  confidence: number; // 0-100, how confident we are in the match
  strategy:
    | "exact"
    | "context"
    | "substring"
    | "case-insensitive"
    | "fuzzy-line"
    | "fuzzy-window";
}

interface FuzzyMatch {
  index: number;
  match: string;
  confidence: number;
}

function computeLineCol(text: string, index: number): Location {
  let line = 1;
  let lastBreak = -1;
  for (let i = 0; i < index; i++) {
    // check for new line character \n
    if (text.charCodeAt(i) === 10) {
      line++;
      lastBreak = i;
    }
  }
  const column = index - lastBreak;
  return { line, column };
}

/**
 * Find best fuzzy match using line-by-line comparison
 * This is the fastest strategy and catches most LLM errors
 */
function findBestLineMatch(
  quotedText: string,
  text: string,
  minConfidence: number
): FuzzyMatch | null {
  const lines = text.split("\n");
  let bestMatch: FuzzyMatch | null = null;
  let currentIndex = 0;

  for (const line of lines) {
    if (!line.trim()) {
      currentIndex += line.length + 1;
      continue;
    }

    // Try multiple scoring strategies and use the best
    const partialScore = partial_ratio(quotedText, line);
    const tokenScore = token_sort_ratio(quotedText, line);
    const exactScore = ratio(quotedText, line);

    const score = Math.max(partialScore, tokenScore, exactScore);

    if (
      score >= minConfidence &&
      (!bestMatch || score > bestMatch.confidence)
    ) {
      bestMatch = {
        index: currentIndex,
        match: line.trim(),
        confidence: score,
      };
    }

    currentIndex += line.length + 1; // +1 for newline
  }

  return bestMatch;
}

/**
 * Find best fuzzy match using sliding window
 * Slower but catches quotes that span multiple lines
 */
function findBestWindowMatch(
  quotedText: string,
  text: string,
  minConfidence: number
): FuzzyMatch | null {
  const quoteLength = quotedText.length;
  // Allow window to be 50% larger/smaller than quote
  const minWindow = Math.floor(quoteLength * 0.5);
  const maxWindow = Math.floor(quoteLength * 1.5);

  let bestMatch: FuzzyMatch | null = null;

  // Try different window sizes
  for (let windowSize = minWindow; windowSize <= maxWindow; windowSize += 10) {
    for (let i = 0; i <= text.length - windowSize; i += 5) {
      // Step by 5 for performance
      const window = text.substring(i, i + windowSize);

      const partialScore = partial_ratio(quotedText, window);
      const tokenScore = token_sort_ratio(quotedText, window);
      const score = Math.max(partialScore, tokenScore);

      if (
        score >= minConfidence &&
        (!bestMatch || score > bestMatch.confidence)
      ) {
        bestMatch = {
          index: i,
          match: window.trim(),
          confidence: score,
        };
      }
    }
  }

  return bestMatch;
}

/**
 * Locates text using hybrid evidence: quoted_text + optional context_before/after.
 *
 * Algorithm (Quote-First with Fuzzy Matching):
 * 1. Try exact match first (fastest, 100% confidence)
 * 2. If multiple exact matches, use context to disambiguate
 * 3. Try progressive substring matching
 * 4. Try case-insensitive exact match
 * 5. Try fuzzy matching by line (fast, catches most LLM hallucinations)
 * 6. Try fuzzy matching with sliding window (slower, catches multi-line issues)
 *
 * This implements the "Quote-First with Fuzzy Matching" pattern from Google's LangExtract:
 * "LLMs extract meaning, while classic algorithms ground that meaning in reality"
 */
export function locateQuotedText(
  text: string,
  ev: QuotedTextEvidence,
  minConfidence: number = 80
): LocationWithMatch | null {
  const quotedText = ev.quoted_text;
  const contextBefore = ev.context_before || "";
  const contextAfter = ev.context_after || "";

  if (!quotedText) return null;

  // PHASE 1: Exact matching (fastest path)
  const matches: Array<{ index: number; match: string }> = [];
  let searchFrom = 0;

  while (true) {
    const idx = text.indexOf(quotedText, searchFrom);
    if (idx === -1) break;
    matches.push({ index: idx, match: quotedText });
    searchFrom = idx + 1;
  }

  if (matches.length > 0) {
    // Single exact match - perfect!
    if (matches.length === 1) {
      const loc = computeLineCol(text, matches[0]!.index);
      return {
        ...loc,
        match: matches[0]!.match,
        confidence: 100,
        strategy: "exact",
      };
    }

    // Multiple exact matches - use context to disambiguate
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
          return {
            ...loc,
            match: match.match,
            confidence: 100,
            strategy: "context",
          };
        }
      }
    }

    // Context didn't help, return first exact match
    const loc = computeLineCol(text, matches[0]!.index);
    return {
      ...loc,
      match: matches[0]!.match,
      confidence: 100,
      strategy: "exact",
    };
  }

  // PHASE 2: Progressive substring matching
  // LLM might have added/removed a few words
  const words = quotedText.split(/\s+/);
  if (words.length >= 3) {
    for (let len = words.length - 1; len >= 3; len--) {
      for (let start = 0; start <= words.length - len; start++) {
        const substring = words.slice(start, start + len).join(" ");
        const idx = text.indexOf(substring);
        if (idx !== -1) {
          const loc = computeLineCol(text, idx);
          const confidence = Math.round((len / words.length) * 100);
          return {
            ...loc,
            match: substring,
            confidence,
            strategy: "substring",
          };
        }
      }
    }
  }

  // PHASE 3: Case-insensitive exact match
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
      confidence: 95,
      strategy: "case-insensitive",
    };
  }

  // PHASE 4: Fuzzy matching by line (fast, handles typos)
  const lineMatch = findBestLineMatch(quotedText, text, minConfidence);
  if (lineMatch) {
    const loc = computeLineCol(text, lineMatch.index);
    return {
      ...loc,
      match: lineMatch.match,
      confidence: Math.round(lineMatch.confidence),
      strategy: "fuzzy-line",
    };
  }

  // PHASE 5: Fuzzy matching with sliding window (slower, multi-line quotes)
  const windowMatch = findBestWindowMatch(quotedText, text, minConfidence);
  if (windowMatch) {
    const loc = computeLineCol(text, windowMatch.index);
    return {
      ...loc,
      match: windowMatch.match,
      confidence: Math.round(windowMatch.confidence),
      strategy: "fuzzy-window",
    };
  }

  // No match found above confidence threshold
  return null;
}

/**
 * Helper to locate multiple quoted texts in one pass
 * Useful for batch processing LLM results
 */
export function locateMultipleQuotes(
  text: string,
  evidences: QuotedTextEvidence[],
  minConfidence: number = 80
): Array<LocationWithMatch | null> {
  return evidences.map((ev) => locateQuotedText(text, ev, minConfidence));
}
