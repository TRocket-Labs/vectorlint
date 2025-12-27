import { describe, it, expect } from "vitest";
import { locateQuotedText } from "../src/output/location";

const originalText = `This is the first line.
The quick brown fox jumps over the lazy dog.
This is the third line with some content.
Another line here with different text.
Some more content to test multi-line matching
across different paragraphs and sections.`;

describe("locateQuotedText", () => {
  describe("exact matching", () => {
    it("finds exact match", () => {
      const result = locateQuotedText(originalText, {
        quoted_text: "quick brown fox",
      });
      expect(result).not.toBeNull();
      expect(result?.line).toBe(2);
      expect(result?.column).toBe(5);
      expect(result?.strategy).toBe("exact");
      expect(result?.confidence).toBe(100);
    });

    it("uses context to disambiguate multiple matches", () => {
      const result = locateQuotedText(originalText, {
        quoted_text: "quick brown fox",
        context_before: "The ",
        context_after: " jumps",
      });
      expect(result).not.toBeNull();
      expect(result?.line).toBe(2);
      expect(result?.strategy).toBe("exact");
    });
  });

  describe("case-insensitive matching", () => {
    it("finds case-insensitive match", () => {
      const result = locateQuotedText(originalText, {
        quoted_text: "QUICK BROWN FOX",
      });
      expect(result).not.toBeNull();
      expect(result?.line).toBe(2);
      expect(result?.strategy).toBe("case-insensitive");
      expect(result?.confidence).toBe(95);
    });
  });

  describe("substring matching", () => {
    it("finds substring when LLM adds/removes words", () => {
      const result = locateQuotedText(originalText, {
        quoted_text: "quik brown fox jumps", // typo + extra word
      });
      expect(result).not.toBeNull();
      expect(result?.strategy).toBe("substring");
    });
  });

  describe("fuzzy matching", () => {
    it("finds fuzzy match with missing words", () => {
      const result = locateQuotedText(originalText, {
        quoted_text: "brown fox over lazy",
      });
      expect(result).not.toBeNull();
      expect(result?.line).toBe(2);
    });

    it("finds fuzzy match with word order changed", () => {
      const result = locateQuotedText(originalText, {
        quoted_text: "fox brown quick",
      });
      expect(result).not.toBeNull();
      expect(result?.confidence).toBeGreaterThanOrEqual(80);
    });
  });

  describe("no match", () => {
    it("returns null for completely unrelated text", () => {
      const result = locateQuotedText(originalText, {
        quoted_text: "the cat sat on the mat",
      });
      expect(result).toBeNull();
    });

    it("returns null for empty quoted_text", () => {
      const result = locateQuotedText(originalText, {
        quoted_text: "",
      });
      expect(result).toBeNull();
    });
  });
});
