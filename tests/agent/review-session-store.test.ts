import { mkdtempSync } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { createReviewSessionStore } from '../../src/agent/review-session-store';

describe('review session store', () => {
  it('creates collision-resilient session files under ~/.vectorlint/reviews', async () => {
    const tmpHome = mkdtempSync(path.join(os.tmpdir(), 'vectorlint-home-'));
    const store = await createReviewSessionStore({ homeDir: tmpHome });
    expect(store.sessionFilePath).toContain(path.join('.vectorlint', 'reviews'));
  });

  it('appends events and replays them in log order', async () => {
    const tmpHome = mkdtempSync(path.join(os.tmpdir(), 'vectorlint-home-'));
    const store = await createReviewSessionStore({ homeDir: tmpHome });

    await store.append({
      eventType: 'session_started',
      payload: { cwd: '/repo', targets: [] },
    });

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
});
