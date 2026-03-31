import { appendFileSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.doUnmock('crypto');
  vi.resetModules();
});

describe('review session store', () => {
  it('creates session files in the VectorLint reviews directory', async () => {
    const { createReviewSessionStore } = await import(
      '../../src/agent/review-session-store'
    );

    const home = mkdtempSync(path.join(os.tmpdir(), 'vectorlint-home-'));
    const store = await createReviewSessionStore({ homeDir: home });

    expect(store.sessionFilePath).toContain(
      `${path.sep}.vectorlint${path.sep}reviews${path.sep}`
    );
    expect(path.basename(store.sessionFilePath)).toMatch(/\.jsonl$/);
    expect(readFileSync(store.sessionFilePath, 'utf8')).toBe('');
  });

  it('persists each appended event as a valid JSONL record', async () => {
    const { createReviewSessionStore } = await import(
      '../../src/agent/review-session-store'
    );

    const home = mkdtempSync(path.join(os.tmpdir(), 'vectorlint-home-'));
    const store = await createReviewSessionStore({ homeDir: home });

    await store.append({
      eventType: 'session_started',
      payload: { cwd: '/repo', targets: ['doc.md'] },
    });
    await store.append({
      eventType: 'session_finalized',
      payload: { totalFindings: 0, summary: 'done' },
    });

    const raw = readFileSync(store.sessionFilePath, 'utf8');
    const lines = raw.trim().split('\n');
    expect(lines).toHaveLength(2);

    const parsed = lines.map((line) => JSON.parse(line) as { eventType?: string });
    expect(parsed.map((event) => event.eventType)).toEqual([
      'session_started',
      'session_finalized',
    ]);
  });

  it('reads persisted session events in order and reports completion state', async () => {
    const { createReviewSessionStore } = await import(
      '../../src/agent/review-session-store'
    );

    const home = mkdtempSync(path.join(os.tmpdir(), 'vectorlint-home-'));
    const store = await createReviewSessionStore({ homeDir: home });

    expect(await store.hasFinalizedEvent()).toBe(false);

    await store.append({
      eventType: 'session_started',
      payload: { cwd: '/repo', targets: ['doc.md'] },
    });
    await store.append({
      eventType: 'session_finalized',
      payload: { totalFindings: 0, summary: 'done' },
    });

    const events = await store.replay();
    expect(events.map((event) => event.eventType)).toEqual([
      'session_started',
      'session_finalized',
    ]);
    expect(await store.hasFinalizedEvent()).toBe(true);
  });

  it('recovers valid events when an existing session file contains malformed JSONL lines', async () => {
    const { createReviewSessionStore } = await import(
      '../../src/agent/review-session-store'
    );

    const home = mkdtempSync(path.join(os.tmpdir(), 'vectorlint-home-'));
    const store = await createReviewSessionStore({ homeDir: home });

    await store.append({
      eventType: 'session_started',
      payload: { cwd: '/repo', targets: ['doc.md'] },
    });

    appendFileSync(store.sessionFilePath, 'not-json\n', 'utf8');
    appendFileSync(store.sessionFilePath, '{"eventType":"unknown"}\n', 'utf8');

    await store.append({
      eventType: 'session_finalized',
      payload: { totalFindings: 0 },
    });

    const events = await store.replay();
    expect(events.map((event) => event.eventType)).toEqual([
      'session_started',
      'session_finalized',
    ]);
  });

  it('creates a unique session file when an initial generated session id collides', async () => {
    const home = mkdtempSync(path.join(os.tmpdir(), 'vectorlint-home-'));
    const reviewsDir = path.join(home, '.vectorlint', 'reviews');
    mkdirSync(reviewsDir, { recursive: true });
    writeFileSync(path.join(reviewsDir, 'collision-id.jsonl'), '', 'utf8');

    const randomUUIDMock = vi
      .fn()
      .mockReturnValueOnce('collision-id')
      .mockReturnValueOnce('fresh-id');

    vi.doMock('crypto', async (importOriginal) => {
      const actual = await importOriginal<typeof import('crypto')>();
      return {
        ...actual,
        randomUUID: randomUUIDMock,
      };
    });

    const { createReviewSessionStore } = await import(
      '../../src/agent/review-session-store'
    );

    const store = await createReviewSessionStore({ homeDir: home });
    expect(path.basename(store.sessionFilePath)).toBe('fresh-id.jsonl');
    expect(readFileSync(store.sessionFilePath, 'utf8')).toBe('');
  });
});
