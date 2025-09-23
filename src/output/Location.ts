export interface Evidence {
  quote: string;
  pre: string;
  post: string;
}

export interface Location {
  line: number; // 1-based
  column: number; // 1-based
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
  const quote = ev.quote ?? '';
  const pre = ev.pre ?? '';
  const post = ev.post ?? '';
  if (!quote) return null;

  // Find all quote occurrences
  const indices: number[] = [];
  let from = 0;
  while (true) {
    const idx = text.indexOf(quote, from);
    if (idx === -1) break;
    indices.push(idx);
    from = idx + 1;
  }
  if (indices.length === 0) return null;

  // Score candidates: prefer exact pre/post matches
  let bestIdx = indices[0];
  let bestScore = -1;
  for (const idx of indices) {
    let score = 0;
    if (pre) {
      const start = Math.max(0, idx - pre.length);
      const before = text.slice(start, idx);
      if (before === pre) score += 2;
    }
    if (post) {
      const after = text.slice(idx + quote.length, idx + quote.length + post.length);
      if (after === post) score += 2;
    }
    if (score > bestScore) {
      bestScore = score;
      bestIdx = idx;
    }
  }

  // If no anchors matched, just use the first occurrence
  return computeLineCol(text, bestIdx);
}

