import { z } from 'zod';

export const CACHE_SCHEMA = z.object({
    version: z.number(),
    entries: z.record(z.string(), z.any())
});