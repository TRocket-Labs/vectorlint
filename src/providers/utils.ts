/**
 * JSON structural delimiters that may legitimately follow a closing string
 * quote. Used to distinguish a real closing quote from an unescaped internal
 * quote when repairing model output.
 */
const JSON_STRUCTURAL_DELIMITERS = new Set([',', '}', ']', ':']);

function isJsonWhitespace(char: string): boolean {
  return char === ' ' || char === '\t' || char === '\n' || char === '\r';
}

/** Escapes literal control characters as JSON escape sequences. */
function escapeControlChars(value: string): string {
  // eslint-disable-next-line no-control-regex -- control characters are the intended match
  return value.replace(/[\x00-\x1f]/g, char => {
    switch (char) {
      case '\n': return '\\n';
      case '\t': return '\\t';
      case '\r': return '\\r';
      case '\b': return '\\b';
      case '\f': return '\\f';
      default:
        return '\\u' + char.charCodeAt(0).toString(16).padStart(4, '0');
    }
  });
}

/**
 * Repairs a JSON string that contains unescaped internal quotes inside string
 * values. Walks the text with a lightweight state machine: a quote inside a
 * string value that is followed (after optional whitespace) by a structural
 * delimiter is treated as the closing quote; any other quote is escaped as
 * `\"`. Literal control characters encountered inside a string value are
 * escaped too, so inter-token whitespace stays valid.
 */
function escapeInternalQuotes(value: string): string {
  let out = '';
  let inString = false;
  for (let i = 0; i < value.length; i++) {
    const char = value[i]!;
    if (!inString) {
      out += char;
      if (char === '"') {
        inString = true;
      }
      continue;
    }

    // Preserve existing escape sequences verbatim.
    if (char === '\\' && i + 1 < value.length) {
      out += char + value[i + 1]!;
      i++;
      continue;
    }

    if (char === '"') {
      let j = i + 1;
      while (j < value.length && isJsonWhitespace(value[j]!)) {
        j++;
      }
      const isClosingQuote = j >= value.length || JSON_STRUCTURAL_DELIMITERS.has(value[j]!);
      if (isClosingQuote) {
        out += '"';
        inString = false;
      } else {
        out += '\\"';
      }
      continue;
    }

    const codePoint = char.charCodeAt(0);
    if (codePoint < 0x20) {
      out += escapeControlChars(char);
      continue;
    }

    out += char;
  }
  return out;
}

/** Tries several repair strategies on a JSON-ish string; returns the parsed value or undefined. */
function repairJsonString(value: string): unknown {
  const attempts = [value, escapeControlChars(value), escapeInternalQuotes(value)];
  for (const candidate of attempts) {
    try {
      return JSON.parse(candidate);
    } catch {
      // try next strategy
    }
  }
  return undefined;
}

function looksLikeJson(value: string): boolean {
  const trimmed = value.trimStart();
  const startsJson = trimmed.startsWith('[') || trimmed.startsWith('{');
  const endsJson = trimmed.endsWith(']') || trimmed.endsWith('}');
  return startsJson && endsJson;
}

/** Recursively repairs any string values that look like double encoded JSON. */
export function repairNestedJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(repairNestedJson);
  }
  if (value !== null && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      result[key] = repairNestedJson(child);
    }
    return result;
  }
  if (typeof value === 'string' && looksLikeJson(value)) {
    const repaired = repairJsonString(value);
    if (repaired !== undefined) {
      return repairNestedJson(repaired);
    }
  }
  return value;
}
