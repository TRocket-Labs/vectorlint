import { describe, expect, it } from "vitest";
import {
  buildCheckLLMSchema,
  buildJudgeLLMSchema,
  buildMergedCheckLLMSchema,
} from "../src/prompts/schema";

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

  it("check schema violation includes message field with correct description", () => {
    const schema = buildCheckLLMSchema();
    const violationProperties =
      schema.schema.properties.violations.items.properties;

    expect(violationProperties.message).toEqual({
      type: "string",
      description: "Under 15 words. State the issue directly to the user. No rule references.",
    });
  });

  it("judge schema violation includes message field with correct description", () => {
    const schema = buildJudgeLLMSchema();
    const violationProperties =
      schema.schema.properties.criteria.items.properties.violations.items
        .properties;

    expect(violationProperties.message).toEqual({
      type: "string",
      description: "Under 15 words. State the issue directly to the user. No rule references.",
    });
  });

  it("check schema violation required array includes message", () => {
    const schema = buildCheckLLMSchema();
    const required = schema.schema.properties.violations.items.required;
    expect(required).toContain("message");
  });

  it("judge schema violation required array includes message", () => {
    const schema = buildJudgeLLMSchema();
    const required =
      schema.schema.properties.criteria.items.properties.violations.items.required;
    expect(required).toContain("message");
  });

  it("merged lint schema adds ruleSource to the base finding shape", () => {
    const schema = buildMergedCheckLLMSchema();
    const findingProperties = schema.schema.properties.findings.items.properties;

    expect(schema.name).toBe("vectorlint_merged_check_result");
    expect(findingProperties.ruleSource).toEqual({ type: "string" });
    expect(findingProperties.message).toEqual({
      type: "string",
      description: "Under 15 words. State the issue directly to the user. No rule references.",
    });
    expect(schema.schema.properties.findings.items.required).toContain("ruleSource");
  });
});
