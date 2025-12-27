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
 * 1. If lineHint provided, try matching on that line first (fastest path)
 * 2. Try exact match first (fastest, 100% confidence)
 * 3. If multiple exact matches, use context to disambiguate
 * 4. Try progressive substring matching
 * 5. Try case-insensitive exact match
 * 6. Try fuzzy matching by line (fast, catches most LLM hallucinations)
 * 7. Try fuzzy matching with sliding window (slower, catches multi-line issues)
 *
 * This implements the "Quote-First with Fuzzy Matching" pattern from Google's LangExtract:
 * "LLMs extract meaning, while classic algorithms ground that meaning in reality"
 */
export function locateQuotedText(
  text: string,
  ev: QuotedTextEvidence,
  minConfidence: number = 80,
  lineHint?: number
): LocationWithMatch | null {
  const quotedText = ev.quoted_text;
  const contextBefore = ev.context_before || "";
  const contextAfter = ev.context_after || "";

  if (!quotedText) return null;

  // PHASE 1: If lineHint provided, try matching on that line first
  if (lineHint && lineHint > 0) {
    const lines = text.split("\n");
    if (lineHint <= lines.length) {
      const targetLine = lines[lineHint - 1] || "";

      // Try exact match on hint line
      const exactIdx = targetLine.indexOf(quotedText);
      if (exactIdx !== -1) {
        // Calculate the absolute index
        let lineStartIdx = 0;
        for (let i = 0; i < lineHint - 1; i++) {
          lineStartIdx += (lines[i]?.length || 0) + 1;
        }
        return {
          line: lineHint,
          column: exactIdx + 1,
          match: quotedText,
          confidence: 100,
          strategy: "exact",
        };
      }

      // Try fuzzy match on hint line
      const partialScore = partial_ratio(quotedText, targetLine);
      const tokenScore = token_sort_ratio(quotedText, targetLine);
      const score = Math.max(partialScore, tokenScore);

      if (score >= minConfidence) {
        // Find the best matching substring on this line
        let bestCol = 1;
        let bestMatch = targetLine.trim();

        // Try to find the actual matched portion
        const words = quotedText.split(/\s+/);
        for (let len = words.length; len >= 1; len--) {
          for (let start = 0; start <= words.length - len; start++) {
            const substring = words.slice(start, start + len).join(" ");
            const subIdx = targetLine.indexOf(substring);
            if (subIdx !== -1) {
              bestCol = subIdx + 1;
              bestMatch = substring;
              break;
            }
          }
        }

        return {
          line: lineHint,
          column: bestCol,
          match: bestMatch,
          confidence: Math.round(score),
          strategy: "fuzzy-line",
        };
      }
    }
    // Line hint didn't work, fall through to full search
  }

  // PHASE 2: Exact matching (fastest path)
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

  // PHASE 3: Progressive substring matching
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

  // PHASE 4: Case-insensitive exact match
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

  // PHASE 5: Fuzzy matching by line (fast, handles typos)
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

  // PHASE 6: Fuzzy matching with sliding window (slower, multi-line quotes)
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
