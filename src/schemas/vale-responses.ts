import { z } from 'zod';

export const VALE_ACTION_SCHEMA = z.object({
  Name: z.string(),
  Params: z.array(z.string()),
});

export const VALE_ISSUE_SCHEMA = z.object({
  Check: z.string(),
  Description: z.string(),
  Message: z.string(),
  Line: z.number(),
  Span: z.tuple([z.number(), z.number()]),
  Match: z.string(),
  Severity: z.string(),
  Link: z.string().optional(),
  Action: VALE_ACTION_SCHEMA.optional(),
});

export const VALE_OUTPUT_SCHEMA = z.record(z.array(VALE_ISSUE_SCHEMA));

export type ValeIssue = z.infer<typeof VALE_ISSUE_SCHEMA>;
export type ValeOutput = z.infer<typeof VALE_OUTPUT_SCHEMA>;
