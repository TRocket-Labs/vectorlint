import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { randomUUID } from 'crypto';
import type { SessionEvent, SessionEventInput } from './types';
import { SESSION_EVENT_SCHEMA } from './types';

const REVIEWS_SUBDIR = path.join('.vectorlint', 'reviews');

export interface ReviewSessionStore {
  sessionId: string;
  sessionFilePath: string;
  append: (event: SessionEventInput) => Promise<SessionEvent>;
  replay: () => Promise<SessionEvent[]>;
  hasFinalizedEvent: () => Promise<boolean>;
}

export interface CreateReviewSessionStoreOptions {
  homeDir?: string;
  now?: () => Date;
}

function createSessionId(): string {
  return `${Date.now()}-${randomUUID()}`;
}

export async function createReviewSessionStore(
  options: CreateReviewSessionStoreOptions = {}
): Promise<ReviewSessionStore> {
  const homeDir = options.homeDir ?? os.homedir();
  const reviewsDir = path.join(homeDir, REVIEWS_SUBDIR);
  await fs.mkdir(reviewsDir, { recursive: true });

  let sessionId = createSessionId();
  let sessionFilePath = path.join(reviewsDir, `${sessionId}.jsonl`);

  const maxCreateAttempts = 10;

  // Collision-resilient exclusive create.
  for (let attempt = 0; attempt < maxCreateAttempts; attempt += 1) {
    try {
      const handle = await fs.open(sessionFilePath, 'wx');
      await handle.close();
      break;
    } catch (error: unknown) {
      const err = error as NodeJS.ErrnoException;
      if (err.code !== 'EEXIST') {
        throw err;
      }
      if (attempt === maxCreateAttempts - 1) {
        throw new Error(`Failed to create unique session file after ${maxCreateAttempts} attempts`);
      }
      sessionId = createSessionId();
      sessionFilePath = path.join(reviewsDir, `${sessionId}.jsonl`);
    }
  }

  const now = options.now ?? (() => new Date());

  return {
    sessionId,
    sessionFilePath,
    append: async (event: SessionEventInput) => {
      const normalized = SESSION_EVENT_SCHEMA.parse({
        sessionId,
        timestamp: now().toISOString(),
        eventType: event.eventType,
        payload: event.payload,
      });
      await fs.appendFile(sessionFilePath, `${JSON.stringify(normalized)}\n`, 'utf8');
      return normalized;
    },
    replay: async () => {
      const raw = await fs.readFile(sessionFilePath, 'utf8');
      const events: SessionEvent[] = [];
      for (const line of raw.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed) {
          continue;
        }
        try {
          events.push(SESSION_EVENT_SCHEMA.parse(JSON.parse(trimmed)));
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error);
          const preview = trimmed.slice(0, 120);
          console.warn(
            `[vectorlint] Skipping malformed session event in ${sessionFilePath}: ${message} (${preview})`
          );
        }
      }
      return events;
    },
    hasFinalizedEvent: async () => {
      const events = await (async () => {
        const raw = await fs.readFile(sessionFilePath, 'utf8');
        return raw.split(/\r?\n/);
      })();

      return events.some((line) => {
        const trimmed = line.trim();
        if (!trimmed) {
          return false;
        }
        try {
          const parsed = SESSION_EVENT_SCHEMA.parse(JSON.parse(trimmed));
          return parsed.eventType === 'session_finalized';
        } catch {
          return false;
        }
      });
    },
  };
}
