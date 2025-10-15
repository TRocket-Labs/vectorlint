export interface Evidence {
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
