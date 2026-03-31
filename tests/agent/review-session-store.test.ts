import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { createReviewSessionStore } from '../../src/agent/review-session-store';

describe('review session store', () => {
  it('creates collision-resilient session files under ~/.vectorlint/reviews', async () => {
    const tmpHome = mkdtempSync(path.join(tmpdir(), 'vectorlint-home-'));
    const store = await createReviewSessionStore({ homeDir: tmpHome });

    expect(store.sessionFilePath).toContain('/.vectorlint/reviews/');
  });

  it('appends events and replays them deterministically', async () => {
    const tmpHome = mkdtempSync(path.join(tmpdir(), 'vectorlint-home-'));
    const store = await createReviewSessionStore({ homeDir: tmpHome });

    await store.append({ eventType: 'session_started', payload: { cwd: '/repo' } });
    await store.append({ eventType: 'session_finalized', payload: { totalFindings: 0 } });

    const events = await store.replay();
    expect(events.map((event) => event.eventType)).toEqual([
      'session_started',
      'session_finalized',
    ]);
  });
});
