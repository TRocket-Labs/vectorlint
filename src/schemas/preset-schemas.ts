import { z } from 'zod';

export const PRESET_ENTRY_SCHEMA = z.object({
    path: z.string(),
    description: z.string().optional(),
});

export const PRESET_REGISTRY_SCHEMA = z.object({
    presets: z.record(z.string(), PRESET_ENTRY_SCHEMA),
});

export type PresetRegistry = z.infer<typeof PRESET_REGISTRY_SCHEMA>;
