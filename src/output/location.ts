export interface Evidence {
  pre: string;
  post: string;
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
    if (text.charCodeAt(i) === 10) { // '\n'
      line++;
      lastBreak = i;
    }
  }
  const column = index - lastBreak;
  return { line, column };
}

export function locateEvidence(text: string, ev: Evidence): Location | null {
  const pre = ev.pre ?? '';
  const post = ev.post ?? '';

  // Strategy:
  // - If both pre and post exist: find occurrences of pre and the nearest following post; anchor at seam.
  // - If only pre: anchor at end of first pre occurrence.
  // - If only post: anchor at start of first post occurrence.
  // - If neither: no location.

  if (pre && post) {
    let bestSeam = -1;
    let bestGap = Number.POSITIVE_INFINITY;
    let from = 0;
    while (true) {
      const i = text.indexOf(pre, from);
      if (i === -1) break;
      const j = text.indexOf(post, i + pre.length);
      if (j !== -1) {
        const gap = j - (i + pre.length);
        if (gap >= 0 && gap < bestGap) {
          bestGap = gap;
          bestSeam = i + pre.length;
        }
      }
      from = i + 1;
    }
    if (bestSeam !== -1) return computeLineCol(text, bestSeam);
  }

  if (pre) {
    const i = text.indexOf(pre);
    if (i !== -1) return computeLineCol(text, i + pre.length);
  }
  if (post) {
    const j = text.indexOf(post);
    if (j !== -1) return computeLineCol(text, j);
  }
  return null;
}

export function extractTextAtLocation(text: string, line: number, column: number, maxLength: number = 100): string {
  // Extract text from content at the specified line and column
  const lines = text.split('\n');
  if (line < 1 || line > lines.length) return '';
  
  const targetLine = lines[line - 1];
  if (!targetLine || column < 1) return '';
  
  // Extract text starting from column position
  // Find a reasonable word/phrase boundary
  const startIdx = Math.max(0, column - 1);
  let endIdx = startIdx;
  
  // Extract until we hit punctuation, newline, or maxLength
  while (endIdx < targetLine.length && endIdx - startIdx < maxLength) {
    const char = targetLine[endIdx];
    // Stop at sentence-ending punctuation or certain delimiters
    if (char === '.' || char === '!' || char === '?' || char === '\n') {
      break;
    }
    endIdx++;
  }
  
  // Trim and return
  let extracted = targetLine.substring(startIdx, endIdx).trim();
  
  // If it's too long, try to cut at a word boundary
  if (extracted.length > maxLength) {
    const words = extracted.substring(0, maxLength).split(' ');
    words.pop(); // Remove last potentially incomplete word
    extracted = words.join(' ');
  }
  
  return extracted;
}

export function locateEvidenceWithMatch(text: string, ev: Evidence): LocationWithMatch | null {
  const pre = ev.pre ?? '';
  const post = ev.post ?? '';

  if (pre && post) {
    let bestSeam = -1;
    let bestGap = Number.POSITIVE_INFINITY;
    let bestMatch = '';
    let from = 0;
    while (true) {
      const i = text.indexOf(pre, from);
      if (i === -1) break;
      const j = text.indexOf(post, i + pre.length);
      if (j !== -1) {
        const gap = j - (i + pre.length);
        if (gap >= 0 && gap < bestGap) {
          bestGap = gap;
          bestSeam = i + pre.length;
          bestMatch = text.substring(i + pre.length, j);
        }
      }
      from = i + 1;
    }
    if (bestSeam !== -1) {
      const loc = computeLineCol(text, bestSeam);
      return { ...loc, match: bestMatch };
    }
  }

  if (pre) {
    const i = text.indexOf(pre);
    if (i !== -1) {
      const loc = computeLineCol(text, i + pre.length);
      return { ...loc, match: '' };
    }
  }
  if (post) {
    const j = text.indexOf(post);
    if (j !== -1) {
      const loc = computeLineCol(text, j);
      return { ...loc, match: '' };
    }
  }
  return null;
}
