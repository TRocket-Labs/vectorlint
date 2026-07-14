import { z } from 'zod';

import { VectorlintError } from '../errors';
import type { ToolCallDefinition } from '../providers/tool-calling-model-client';
import type { ReviewTargetReadCapability } from '../review/executor';

/**
 * The single executor-owned tool name exposed to the bounded tool-calling
 * transport (audit Product Decision): page through the target under review by
 * 1-based line range. This is the only agent-like capability that survives the
 * Phase 4 agent removal.
 */
export const READ_TARGET_SECTION_TOOL_NAME = 'read_target_section';

/**
 * Zod schema for {@link TargetReadCapability.readTargetSection} arguments:
 * 1-based positive integers. The tool adapter parses model input against this
 * before slicing, so malformed arguments become model-visible errors.
 */
export const READ_TARGET_SECTION_PARAMETERS = z
  .object({
    startLine: z.number().int().positive(),
    endLine: z.number().int().positive(),
  })
  .strict();

const READ_TARGET_SECTION_DESCRIPTION = [
  'Read a 1-based inclusive [startLine, endLine] window of the target content under review.',
  'Returns the window with original line numbers prepended so findings can cite exact lines.',
  'A window outside [1, targetLineCount], or with startLine > endLine, returns an error result',
  'describing the valid range instead of aborting the review.',
].join(' ');

/**
 * Thrown by {@link TargetReadCapability.readTargetSection} when the requested
 * window is outside the target's valid line range. The tool adapter translates
 * this into a model-visible error result so the bounded run continues.
 */
export class TargetSectionRangeError extends VectorlintError {
  constructor(
    message: string,
    public readonly lineCount: number,
  ) {
    super(message, 'TARGET_SECTION_RANGE');
    this.name = 'TargetSectionRangeError';
  }
}

/** Success result of a {@link TargetReadCapability.readTargetSection} call. */
export interface TargetSectionResult {
  startLine: number;
  endLine: number;
  /** The requested window, each line prefixed with its 1-based line number. */
  content: string;
}

/** Model-visible error result returned in place of a window for invalid calls. */
export interface TargetSectionErrorResult {
  error: string;
  /** Total lines in the target, so the model can retry with a valid range. */
  lineCount: number;
}

/**
 * The on-page boundary adapter (audit Finding #5): a target-only
 * {@link ReviewTargetReadCapability} bound to the in-memory
 * `ReviewTarget.content`. It performs NO filesystem access and reads no URI
 * other than the target it was constructed from. The agent executor exposes
 * this single capability to the model via {@link buildReadTargetSectionTool}.
 */
export class TargetReadCapability implements ReviewTargetReadCapability {
  private readonly lines: readonly string[];

  constructor(content: string) {
    // Mirrors prependLineNumbers: a trailing newline yields a final empty line.
    this.lines = content.split('\n');
  }

  /** Number of addressable lines in the target. */
  get lineCount(): number {
    return this.lines.length;
  }

  readTargetSection(startLine: number, endLine: number): Promise<TargetSectionResult> {
    this.assertValidRange(startLine, endLine);
    const slice = this.lines.slice(startLine - 1, endLine);
    const content = slice.map((line, index) => `${startLine + index}\t${line}`).join('\n');
    return Promise.resolve({ startLine, endLine, content });
  }

  private assertValidRange(startLine: number, endLine: number): void {
    const lineCount = this.lineCount;
    if (!Number.isInteger(startLine) || !Number.isInteger(endLine)) {
      throw new TargetSectionRangeError(
        `read_target_section requires integer line numbers; got startLine=${startLine}, endLine=${endLine}. Valid range is [1, ${lineCount}].`,
        lineCount,
      );
    }
    if (startLine < 1 || endLine < 1) {
      throw new TargetSectionRangeError(
        `read_target_section requires 1-based positive line numbers; got startLine=${startLine}, endLine=${endLine}. Valid range is [1, ${lineCount}].`,
        lineCount,
      );
    }
    if (startLine > endLine) {
      throw new TargetSectionRangeError(
        `read_target_section requires startLine <= endLine; got startLine=${startLine}, endLine=${endLine}. Valid range is [1, ${lineCount}].`,
        lineCount,
      );
    }
    if (startLine > lineCount) {
      throw new TargetSectionRangeError(
        `read_target_section startLine=${startLine} is beyond the target's ${lineCount} line(s). Valid range is [1, ${lineCount}].`,
        lineCount,
      );
    }
    if (endLine > lineCount) {
      throw new TargetSectionRangeError(
        `read_target_section endLine=${endLine} is beyond the target's ${lineCount} line(s). Valid range is [1, ${lineCount}].`,
        lineCount,
      );
    }
  }
}

/**
 * Builds the single executor-owned tool map exposed to the
 * {@link ToolCallingModelClient}: exactly one entry, `read_target_section`,
 * bound to the target-only {@link TargetReadCapability}. Argument-parse and
 * range failures are returned as model-visible error results (never thrown
 * past the tool boundary) so the bounded review run continues.
 */
export function buildReadTargetSectionTool(
  capability: TargetReadCapability,
): Record<string, ToolCallDefinition> {
  return {
    [READ_TARGET_SECTION_TOOL_NAME]: {
      description: READ_TARGET_SECTION_DESCRIPTION,
      parameters: READ_TARGET_SECTION_PARAMETERS,
      execute: async (
        input: unknown,
      ): Promise<TargetSectionResult | TargetSectionErrorResult> => {
        const parsed = READ_TARGET_SECTION_PARAMETERS.safeParse(input);
        if (!parsed.success) {
          return {
            error: `Invalid read_target_section arguments: ${parsed.error.message}.`,
            lineCount: capability.lineCount,
          };
        }
        const { startLine, endLine } = parsed.data;
        try {
          return await capability.readTargetSection(startLine, endLine);
        } catch (error: unknown) {
          if (error instanceof TargetSectionRangeError) {
            return { error: error.message, lineCount: error.lineCount };
          }
          throw error;
        }
      },
    },
  };
}
