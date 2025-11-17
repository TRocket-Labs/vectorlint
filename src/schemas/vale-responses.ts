import { z } from 'zod';

/**
 * Schema for Vale CLI action object.
 */
export const VALE_ACTION_SCHEMA = z.object({
  Name: z.string(),
  Params: z.array(z.string()),
});

/**
 * Schema for a single Vale issue.
 * Validates Vale CLI JSON output structure.
 */
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

/**
 * Schema for Vale CLI JSON output.
 * Maps filenames to arrays of issues.
 */
export const VALE_OUTPUT_SCHEMA = z.record(z.array(VALE_ISSUE_SCHEMA));

export type ValeIssue = z.infer<typeof VALE_ISSUE_SCHEMA>;
export type ValeOutput = z.infer<typeof VALE_OUTPUT_SCHEMA>;
