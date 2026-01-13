import { describe, it, expect, vi } from 'vitest';
import {
  DetectionPhaseRunner,
  type RawDetectionIssue,
  type DetectionResult,
} from '../src/evaluators/detection-phase';

describe('DetectionPhaseRunner', () => {
  // Mock LLM provider for testing
  const createMockProvider = (response: string) => ({
    runPromptUnstructured: vi.fn().mockResolvedValue({
      data: response,
      usage: { inputTokens: 100, outputTokens: 50 },
    }),
  });

  describe('parseResponse', () => {
    const mockProvider = createMockProvider('');

    it('should parse single issue correctly', () => {
      const runner = new DetectionPhaseRunner(mockProvider);

      const response = `## Issue 1

**quotedText:**
> This is bad text

**contextBefore:**
Some text before

**contextAfter:**
Some text after

**line:** 42

**criterionName:** No passive voice

**analysis:**
This uses passive voice which should be avoided.`;

      // Access private method via type assertion for testing
      const issues = (runner as any).parseResponse(response);

      expect(issues).toHaveLength(1);
      expect(issues[0]).toEqual({
        quotedText: 'This is bad text',
        contextBefore: 'Some text before',
        contextAfter: 'Some text after',
        line: 42,
        criterionName: 'No passive voice',
        analysis: 'This uses passive voice which should be avoided.',
      });
    });

    it('should parse multiple issues correctly', () => {
      const runner = new DetectionPhaseRunner(mockProvider);

      const response = `## Issue 1

**quotedText:**
> First issue

**contextBefore:**
Before first

**contextAfter:**
After first

**line:** 10

**criterionName:** Rule A

**analysis:**
Analysis for first issue

## Issue 2

**quotedText:**
> Second issue

**contextBefore:**
Before second

**contextAfter:**
After second

**line:** 20

**criterionName:** Rule B

**analysis:**
Analysis for second issue`;

      const issues = (runner as any).parseResponse(response);

      expect(issues).toHaveLength(2);
      expect(issues[0].line).toBe(10);
      expect(issues[0].criterionName).toBe('Rule A');
      expect(issues[1].line).toBe(20);
      expect(issues[1].criterionName).toBe('Rule B');
    });

    it('should return empty array for "No issues found" response', () => {
      const runner = new DetectionPhaseRunner(mockProvider);

      const response = 'No issues found in this content.';

      const issues = (runner as any).parseResponse(response);

      expect(issues).toHaveLength(0);
    });

    it('should return empty array for "NO ISSUES FOUND" (case insensitive)', () => {
      const runner = new DetectionPhaseRunner(mockProvider);

      const response = 'After analysis, NO ISSUES FOUND were detected.';

      const issues = (runner as any).parseResponse(response);

      expect(issues).toHaveLength(0);
    });

    it('should handle malformed issue sections gracefully by returning null', () => {
      const runner = new DetectionPhaseRunner(mockProvider);

      // Missing required fields (quotedText, line, criterionName, analysis)
      const response = `## Issue 1

**contextBefore:**
Some before text

**contextAfter:**
Some after text`;

      const issues = (runner as any).parseResponse(response);

      expect(issues).toHaveLength(0);
    });

    it('should handle mixed valid and invalid issues', () => {
      const runner = new DetectionPhaseRunner(mockProvider);

      const response = `## Issue 1

**quotedText:**
> Valid issue

**contextBefore:**
Before

**contextAfter:**
After

**line:** 10

**criterionName:** Rule A

**analysis:**
Valid analysis

## Issue 2

**contextBefore:**
Invalid - missing required fields

## Issue 3

**quotedText:**
> Another valid issue

**contextBefore:**
Before 3

**contextAfter:**
After 3

**line:** 30

**criterionName:** Rule C

**analysis:**
Valid analysis 3`;

      const issues = (runner as any).parseResponse(response);

      expect(issues).toHaveLength(2);
      expect(issues[0].line).toBe(10);
      expect(issues[1].line).toBe(30);
    });

    it('should handle quoted text with special characters', () => {
      const runner = new DetectionPhaseRunner(mockProvider);

      const response = `## Issue 1

**quotedText:**
> Text with "quotes" and 'apostrophes' and (parentheses)

**contextBefore:**
Before

**contextAfter:**
After

**line:** 5

**criterionName:** Special chars

**analysis:**
Handles special characters`;

      const issues = (runner as any).parseResponse(response);

      expect(issues).toHaveLength(1);
      expect(issues[0].quotedText).toContain('quotes');
    });

    it('should handle multiline analysis text', () => {
      const runner = new DetectionPhaseRunner(mockProvider);

      const response = `## Issue 1

**quotedText:**
> Issue text

**contextBefore:**
Before

**contextAfter:**
After

**line:** 15

**criterionName:** Multiline

**analysis:**
This is the first paragraph of analysis.

This is the second paragraph with more details.
And a third line.`;

      const issues = (runner as any).parseResponse(response);

      expect(issues).toHaveLength(1);
      expect(issues[0].analysis).toContain('first paragraph');
      expect(issues[0].analysis).toContain('second paragraph');
    });

    it('should use empty string for missing optional context fields', () => {
      const runner = new DetectionPhaseRunner(mockProvider);

      const response = `## Issue 1

**quotedText:**
> Issue text

**line:** 5

**criterionName:** Minimal

**analysis:**
Minimal issue without context`;

      const issues = (runner as any).parseResponse(response);

      expect(issues).toHaveLength(1);
      expect(issues[0].contextBefore).toBe('');
      expect(issues[0].contextAfter).toBe('');
    });
  });

  describe('run method', () => {
    it('should call LLM provider with content and built prompt', async () => {
      const mockProvider = createMockProvider('No issues found');
      const runner = new DetectionPhaseRunner(mockProvider);

      await runner.run('Sample content', 'No passive voice');

      expect(mockProvider.runPromptUnstructured).toHaveBeenCalledWith(
        'Sample content',
        expect.stringContaining('No passive voice')
      );
    });

    it('should return detection result with parsed issues', async () => {
      const response = `## Issue 1

**quotedText:**
> Bad text

**contextBefore:**
Before

**contextAfter:**
After

**line:** 10

**criterionName:** Rule A

**analysis:**
Analysis text`;

      const mockProvider = createMockProvider(response);
      const runner = new DetectionPhaseRunner(mockProvider);

      const result = await runner.run('Content', 'Criteria');

      expect(result.issues).toHaveLength(1);
      expect(result.issues[0].quotedText).toBe('Bad text');
      expect(result.hasIssues).toBe(true);
      expect(result.rawResponse).toBe(response);
      expect(result.usage).toEqual({ inputTokens: 100, outputTokens: 50 });
    });

    it('should return hasIssues false when no issues found', async () => {
      const mockProvider = createMockProvider('No issues found');
      const runner = new DetectionPhaseRunner(mockProvider);

      const result = await runner.run('Perfect content', 'Criteria');

      expect(result.issues).toHaveLength(0);
      expect(result.hasIssues).toBe(false);
    });

    it('should use default maxRetries of 3 when not specified', async () => {
      const mockProvider = createMockProvider('No issues found');
      const runner = new DetectionPhaseRunner(mockProvider);

      await runner.run('Content', 'Criteria');

      // Verify the provider was called (retry logic is tested in retry.test.ts)
      expect(mockProvider.runPromptUnstructured).toHaveBeenCalled();
    });
  });

  describe('Property 2: Detection Response Parser', () => {
    it('Property 2: Detection parser correctly extracts all required fields from well-formed LLM response', () => {
      const mockProvider = createMockProvider('');
      const runner = new DetectionPhaseRunner(mockProvider);

      // A well-formed response with all fields properly formatted
      const wellFormedResponse = `## Issue 1

**quotedText:**
> The data was processed by the system

**contextBefore:**
We ran the experiments and

**contextAfter:**
, which took about 5 seconds to complete.

**line:** 42

**criterionName:** Avoid passive voice

**analysis:**
This sentence uses passive voice ("was processed") instead of active voice. Rewrite as "The system processed the data".

## Issue 2

**quotedText:**
> utilize

**contextBefore:**
We should

**contextAfter:**
the available resources efficiently.

**line:** 17

**criterionName:** Use simple vocabulary

**analysis:**
"Utilize" is unnecessarily complex. Use "use" instead for better clarity.

## Issue 3

**quotedText:**
> In order to

**contextBefore:**
**

**contextAfter:**
start the process, press the button.

**line:** 5

**criterionName:** Avoid wordy phrases

**analysis:**
"In order to" is wordy. Use "To" instead.`;

      const issues: RawDetectionIssue[] = (runner as any).parseResponse(
        wellFormedResponse
      );

      // Verify all three issues were extracted
      expect(issues).toHaveLength(3);

      // Verify Issue 1 - all required fields present and correct
      expect(issues[0].quotedText).toBe('The data was processed by the system');
      expect(issues[0].contextBefore).toBe(
        'We ran the experiments and'
      );
      expect(issues[0].contextAfter).toBe(
        ', which took about 5 seconds to complete.'
      );
      expect(issues[0].line).toBe(42);
      expect(issues[0].criterionName).toBe('Avoid passive voice');
      expect(issues[0].analysis).toContain('passive voice');

      // Verify Issue 2
      expect(issues[1].quotedText).toBe('utilize');
      expect(issues[1].contextBefore).toBe('We should');
      expect(issues[1].contextAfter).toBe('the available resources efficiently.');
      expect(issues[1].line).toBe(17);
      expect(issues[1].criterionName).toBe('Use simple vocabulary');
      expect(issues[1].analysis).toContain('Use');

      // Verify Issue 3
      expect(issues[2].quotedText).toBe('In order to');
      expect(issues[2].line).toBe(5);
      expect(issues[2].criterionName).toBe('Avoid wordy phrases');
      expect(issues[2].analysis).toContain('wordy');
    });

    it('Property 2: Detection parser handles malformed sections by skipping them while preserving valid ones', () => {
      const mockProvider = createMockProvider('');
      const runner = new DetectionPhaseRunner(mockProvider);

      // Response with mix of valid and malformed issues
      const mixedQualityResponse = `## Issue 1

**quotedText:**
> Valid issue text

**contextBefore:**
Valid before

**contextAfter:**
Valid after

**line:** 10

**criterionName:** Valid Rule

**analysis:**
Valid analysis

## Issue 2

**contextBefore:**
Missing quotedText - this should be skipped

**line:** 20

**criterionName:** Invalid Rule

**analysis:**
Invalid analysis

## Issue 3

**quotedText:**
> Another valid issue

**line:** 30

**criterionName:** Another Valid Rule

**analysis:**
Another valid analysis

## Issue 4

**quotedText:**
> Missing line number

**contextBefore:**
Before

**contextAfter:**
After

**criterionName:** Missing Line Rule

**analysis:**
Should be skipped due to missing line number

## Issue 5

**quotedText:**
> Third valid issue

**contextBefore:**
Before 5

**contextAfter:**
After 5

**line:** 50

**criterionName:** Third Valid Rule

**analysis:**
Third valid analysis`;

      const issues: RawDetectionIssue[] = (runner as any).parseResponse(
        mixedQualityResponse
      );

      // Should extract 3 valid issues (Issue 1, 3, and 5)
      // Issue 2 is missing quotedText
      // Issue 4 is missing line number
      expect(issues).toHaveLength(3);

      // Verify the valid issues were extracted correctly
      expect(issues[0].line).toBe(10);
      expect(issues[0].criterionName).toBe('Valid Rule');

      expect(issues[1].line).toBe(30);
      expect(issues[1].criterionName).toBe('Another Valid Rule');

      expect(issues[2].line).toBe(50);
      expect(issues[2].criterionName).toBe('Third Valid Rule');
    });

    it('Property 2: Detection parser handles various response edge cases gracefully', () => {
      const mockProvider = createMockProvider('');
      const runner = new DetectionPhaseRunner(mockProvider);

      // Test various edge cases
      const edgeCases = [
        // Empty response
        { response: '', expectedCount: 0 },
        // Only intro text, no issues
        { response: 'Here is my analysis of the content.', expectedCount: 0 },
        // "No issues found" in various formats
        { response: 'No issues found', expectedCount: 0 },
        { response: 'NO ISSUES FOUND', expectedCount: 0 },
        { response: 'After careful analysis, no issues found.', expectedCount: 0 },
        // Issue header but no content
        { response: '## Issue 1', expectedCount: 0 },
        // Malformed section header
        { response: '## Issue', expectedCount: 0 },
        { response: 'Issue 1', expectedCount: 0 },
      ];

      for (const testCase of edgeCases) {
        const issues: RawDetectionIssue[] = (runner as any).parseResponse(
          testCase.response
        );
        expect(issues).toHaveLength(testCase.expectedCount);
      }
    });

    it('Property 2: Detection parser preserves whitespace and formatting in extracted text', () => {
      const mockProvider = createMockProvider('');
      const runner = new DetectionPhaseRunner(mockProvider);

      const response = `## Issue 1

**quotedText:**
>    Text with extra    whitespace

**contextBefore:**
  Before with spaces

**contextAfter:**
After with tabs	and spaces

**line:** 1

**criterionName:** Whitespace test

**analysis:**
  Analysis with leading and trailing whitespace

`;

      const issues: RawDetectionIssue[] = (runner as any).parseResponse(response);

      expect(issues).toHaveLength(1);
      // Whitespace should be trimmed as per implementation
      expect(issues[0].quotedText).toBe('Text with extra    whitespace');
      expect(issues[0].contextBefore).toBe('Before with spaces');
      expect(issues[0].analysis).toBe('Analysis with leading and trailing whitespace');
    });
  });
});
