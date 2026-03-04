import { describe, expect, it } from "vitest";
import { buildCheckLLMSchema, buildJudgeLLMSchema } from "../src/prompts/schema";

describe("prompt schema verbosity constraints", () => {
  it("includes concise analysis and suggestion descriptions for check schema", () => {
    const schema = buildCheckLLMSchema();
    const violationProperties =
      schema.schema.properties.violations.items.properties;

    expect(violationProperties.analysis).toEqual({
      type: "string",
      description: "A concise 1-2 sentence explanation of the specific issue.",
    });
    expect(violationProperties.suggestion).toEqual({
      type: "string",
      description: "Suggest a fix in 15 words or less.",
    });
  });

  it("includes concise analysis and suggestion descriptions for judge schema", () => {
    const schema = buildJudgeLLMSchema();
    const violationProperties =
      schema.schema.properties.criteria.items.properties.violations.items
        .properties;

    expect(violationProperties.analysis).toEqual({
      type: "string",
      description: "A concise 1-2 sentence explanation of the specific issue.",
    });
    expect(violationProperties.suggestion).toEqual({
      type: "string",
      description: "Suggest a fix in 15 words or less.",
    });
  });
});
