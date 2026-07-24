import { describe, expect, it } from 'vitest';

import {
  buildReadTargetSectionTool,
  READ_TARGET_SECTION_TOOL_NAME,
  TargetReadCapability,
  type TargetSectionErrorResult,
  type TargetSectionResult,
} from '../../src/executors/target-read-capability-adapter';

const CONTENT = 'alpha line\nbeta line\ngamma line\n';

describe('TargetReadCapability', () => {
  it('counts lines including the trailing empty line (mirrors prependLineNumbers)', () => {
    expect(new TargetReadCapability(CONTENT).lineCount).toBe(4);
    expect(new TargetReadCapability('only one').lineCount).toBe(1);
  });

  it('slices only the in-memory target content with original line numbers', async () => {
    const capability = new TargetReadCapability(CONTENT);

    const first = await capability.readTargetSection(1, 2);
    expect(first).toEqual({
      startLine: 1,
      endLine: 2,
      content: '1\talpha line\n2\tbeta line',
    });

    const tail = await capability.readTargetSection(3, 4);
    expect(tail).toEqual({
      startLine: 3,
      endLine: 4,
      content: '3\tgamma line\n4\t',
    });
  });
});

describe('buildReadTargetSectionTool', () => {
  function toolFor(content: string) {
    return buildReadTargetSectionTool(new TargetReadCapability(content));
  }

  it('exposes exactly one tool named read_target_section', () => {
    const tools = toolFor(CONTENT);
    expect(Object.keys(tools)).toEqual([READ_TARGET_SECTION_TOOL_NAME]);
  });

  it('returns numbered target windows for valid ranges (target-only slicing)', async () => {
    const tools = toolFor(CONTENT);
    const result = (await tools[READ_TARGET_SECTION_TOOL_NAME]!.execute({
      startLine: 1,
      endLine: 3,
    })) as TargetSectionResult;

    expect(result).toEqual({
      startLine: 1,
      endLine: 3,
      content: '1\talpha line\n2\tbeta line\n3\tgamma line',
    });
  });

  it('returns a model-visible error (never throws) when endLine exceeds the target', async () => {
    const tools = toolFor(CONTENT);
    const result = (await tools[READ_TARGET_SECTION_TOOL_NAME]!.execute({
      startLine: 1,
      endLine: 99,
    })) as TargetSectionErrorResult;

    expect(result.error).toContain('99');
    expect(result.lineCount).toBe(4);
  });

  it('returns a model-visible error when startLine is past the target', async () => {
    const tools = toolFor(CONTENT);
    const result = (await tools[READ_TARGET_SECTION_TOOL_NAME]!.execute({
      startLine: 10,
      endLine: 12,
    })) as TargetSectionErrorResult;

    expect(result.error).toContain('10');
    expect(result.lineCount).toBe(4);
  });

  it('returns a model-visible error for an inverted range', async () => {
    const tools = toolFor(CONTENT);
    const result = (await tools[READ_TARGET_SECTION_TOOL_NAME]!.execute({
      startLine: 3,
      endLine: 1,
    })) as TargetSectionErrorResult;

    expect(result.error).toMatch(/startLine <= endLine/);
  });

  it('returns a model-visible error for malformed arguments', async () => {
    const tools = toolFor(CONTENT);
    const execute = tools[READ_TARGET_SECTION_TOOL_NAME]!.execute;

    const missing = (await execute({ startLine: 1 })) as TargetSectionErrorResult;
    expect(missing.error).toMatch(/Invalid read_target_section arguments/);
    expect(missing.lineCount).toBe(4);

    const negative = (await execute({ startLine: 0, endLine: 2 })) as TargetSectionErrorResult;
    expect(negative.error).toMatch(/Invalid read_target_section arguments/);

    const floats = (await execute({ startLine: 1.5, endLine: 2 })) as TargetSectionErrorResult;
    expect(floats.error).toMatch(/Invalid read_target_section arguments/);
  });
});
