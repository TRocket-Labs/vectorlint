import { describe, expect, it } from "vitest";
import { buildReviewLLMSchema } from "../src/prompts/schema";

describe("prompt schema verbosity constraints", () => {
  it("includes concise analysis and suggestion descriptions", () => {
    const schema = buildReviewLLMSchema();
    const violationProperties = schema.schema.properties.violations.items.properties;

    expect(violationProperties.analysis).toEqual({
      type: "string",
      description: "A concise 1-2 sentence explanation of the specific issue.",
    });
    expect(violationProperties.suggestion).toEqual({
      type: "string",
      description: "Suggest a fix in 15 words or less.",
    });
  });

  it("includes the concise user-facing message field", () => {
    const schema = buildReviewLLMSchema();
    const violationProperties = schema.schema.properties.violations.items.properties;

    expect(violationProperties.message).toEqual({
      type: "string",
      description: "Under 15 words. State the issue directly to the user. No rule references.",
    });
    expect(schema.schema.properties.violations.items.required).toContain("message");
  });
});
