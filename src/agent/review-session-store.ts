import { randomUUID } from 'crypto';
import { appendFile, mkdir, open, readFile } from 'fs/promises';
import { homedir } from 'os';
import path from 'path';
import {
  SessionEventSchema,
  type SessionEvent,
} from './types';

const DEFAULT_ATTEMPTS = 20;

type AppendableSessionEvent = Omit<SessionEvent, 'sessionId' | 'timestamp'>;

export interface ReviewSessionStore {
  sessionId: string;
  sessionFilePath: string;
  append(event: AppendableSessionEvent): Promise<SessionEvent>;
  replay(): Promise<SessionEvent[]>;
  hasFinalizedEvent(): Promise<boolean>;
}

export interface CreateReviewSessionStoreOptions {
  homeDir?: string;
  maxCreateAttempts?: number;
  sessionIdFactory?: () => string;
  now?: () => Date;
}

function defaultSessionIdFactory(): string {
  return `${Date.now()}-${randomUUID()}`;
}

export async function createReviewSessionStore(
  options: CreateReviewSessionStoreOptions = {}
): Promise<ReviewSessionStore> {
  const reviewsDir = path.join(
    options.homeDir ?? homedir(),
    '.vectorlint',
    'reviews'
  );
  await mkdir(reviewsDir, { recursive: true });

  const maxAttempts = options.maxCreateAttempts ?? DEFAULT_ATTEMPTS;
  const sessionIdFactory = options.sessionIdFactory ?? defaultSessionIdFactory;
  const now = options.now ?? (() => new Date());

  let lastError: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const sessionId = sessionIdFactory();
    const sessionFilePath = path.join(reviewsDir, `${sessionId}.jsonl`);

    try {
      const handle = await open(sessionFilePath, 'wx');
      await handle.close();

      const replay = async (): Promise<SessionEvent[]> => {
        const contents = await readFile(sessionFilePath, 'utf-8');
        const lines = contents.split(/\r?\n/).filter(Boolean);
        return lines.map((line) => SessionEventSchema.parse(JSON.parse(line)));
      };

      return {
        sessionId,
        sessionFilePath,
        async append(event) {
          const normalizedEvent = SessionEventSchema.parse({
            sessionId,
            timestamp: now().toISOString(),
            ...event,
          });

          await appendFile(
            sessionFilePath,
            `${JSON.stringify(normalizedEvent)}\n`,
            'utf-8'
          );

          return normalizedEvent;
        },
        replay,
        async hasFinalizedEvent() {
          const events = await replay();
          return events.some((event) => event.eventType === 'session_finalized');
        },
      };
    } catch (error: unknown) {
      lastError = error;
    }
  }

  throw new Error(
    `Unable to create unique review session file after ${maxAttempts} attempts: ${String(
      lastError
    )}`
  );
}
