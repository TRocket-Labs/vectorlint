import { randomUUID } from 'crypto';
import { appendFile, mkdir, open, readFile } from 'fs/promises';
import * as path from 'path';
import { SESSION_EVENT_SCHEMA, type SessionEvent } from './types';

type AppendableSessionEvent = Omit<SessionEvent, 'sessionId' | 'timestamp'>;

export interface ReviewSessionStore {
  sessionId: string;
  sessionFilePath: string;
  append: (event: AppendableSessionEvent) => Promise<void>;
  replay: () => Promise<SessionEvent[]>;
  hasFinalizedEvent: () => Promise<boolean>;
}

function buildSessionFilePath(reviewsDir: string, sessionId: string): string {
  return path.join(reviewsDir, `${sessionId}.jsonl`);
}

async function createUniqueSessionFile(reviewsDir: string): Promise<{ sessionId: string; sessionFilePath: string }> {
  while (true) {
    const sessionId = randomUUID();
    const sessionFilePath = buildSessionFilePath(reviewsDir, sessionId);

    try {
      const handle = await open(sessionFilePath, 'wx');
      await handle.close();
      return { sessionId, sessionFilePath };
    } catch (error) {
      if (error instanceof Error && 'code' in error && (error as { code: string }).code === 'EEXIST') {
        continue;
      }
      throw error;
    }
  }
}

export async function createReviewSessionStore({ homeDir }: { homeDir: string }): Promise<ReviewSessionStore> {
  const reviewsDir = path.join(homeDir, '.vectorlint', 'reviews');
  await mkdir(reviewsDir, { recursive: true });

  const { sessionId, sessionFilePath } = await createUniqueSessionFile(reviewsDir);

  async function append(event: AppendableSessionEvent): Promise<void> {
    const parsed = SESSION_EVENT_SCHEMA.parse({
      sessionId,
      timestamp: new Date().toISOString(),
      ...event,
    });
    await appendFile(sessionFilePath, `${JSON.stringify(parsed)}\n`, 'utf8');
  }

  async function replay(): Promise<SessionEvent[]> {
    let raw = '';
    try {
      raw = await readFile(sessionFilePath, 'utf8');
    } catch (error) {
      if (error instanceof Error && 'code' in error && (error as { code: string }).code === 'ENOENT') {
        return [];
      }
      throw error;
    }

    const events: SessionEvent[] = [];
    const lines = raw.split('\n').filter((line) => line.trim().length > 0);

    for (const line of lines) {
      try {
        const candidate = JSON.parse(line) as unknown;
        const parsed = SESSION_EVENT_SCHEMA.safeParse(candidate);
        if (parsed.success) {
          events.push(parsed.data);
        }
      } catch {
        // Ignore malformed JSONL lines so replay can recover valid events.
      }
    }

    return events;
  }

  async function hasFinalizedEvent(): Promise<boolean> {
    const events = await replay();
    return events.some((event) => event.eventType === 'session_finalized');
  }

  return {
    sessionId,
    sessionFilePath,
    append,
    replay,
    hasFinalizedEvent,
  };
}
