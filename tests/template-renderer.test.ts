import { describe, it, expect } from "vitest";
import {
  renderTemplate,
  hasTemplateVariables,
  extractTemplateVariables,
  type TemplateVariables,
} from "../src/prompts/template-renderer";

describe("renderTemplate", () => {
  it("should render simple string variables", () => {
    const template = "Hello {{name}}!";
    const variables: TemplateVariables = { name: "World" };
    expect(renderTemplate(template, variables)).toBe("Hello World!");
  });

  it("should render multiple variables", () => {
    const template = "{{greeting}} {{name}}, you are {{age}} years old.";
    const variables: TemplateVariables = {
      greeting: "Hello",
      name: "Alice",
      age: 30,
    };
    expect(renderTemplate(template, variables)).toBe(
      "Hello Alice, you are 30 years old."
    );
  });

  it("should render array variables as newline-separated strings", () => {
    const template = "Claims:\n{{claims}}";
    const variables: TemplateVariables = {
      claims: ["Claim 1: The sky is blue", "Claim 2: Water is wet"],
    };
    expect(renderTemplate(template, variables)).toBe(
      "Claims:\nClaim 1: The sky is blue\nClaim 2: Water is wet"
    );
  });

  it("should render object variables as JSON", () => {
    const template = "Config: {{config}}";
    const variables: TemplateVariables = {
      config: { debug: true, timeout: 5000 },
    };
    expect(renderTemplate(template, variables)).toBe(
      'Config: {\n  "debug": true,\n  "timeout": 5000\n}'
    );
  });

  it("should render boolean variables", () => {
    const template = "Is active: {{isActive}}";
    const variables: TemplateVariables = { isActive: true };
    expect(renderTemplate(template, variables)).toBe("Is active: true");
  });

  it("should handle variables with whitespace in placeholders", () => {
    const template = "Hello {{ name }}!";
    const variables: TemplateVariables = { name: "World" };
    expect(renderTemplate(template, variables)).toBe("Hello World!");
  });

  it("should handle empty string values", () => {
    const template = "Value: {{value}}!";
    const variables: TemplateVariables = { value: "" };
    expect(renderTemplate(template, variables)).toBe("Value: !");
  });

  it("should throw error when variable is not defined", () => {
    const template = "Hello {{name}}!";
    const variables: TemplateVariables = {};
    expect(() => renderTemplate(template, variables)).toThrow(
      "Template variable 'name' is not defined"
    );
  });

  it("should include available variables in error message", () => {
    const template = "Hello {{name}}!";
    const variables: TemplateVariables = { greeting: "Hi", age: 30 };
    expect(() => renderTemplate(template, variables)).toThrow(
      "Available variables: greeting, age"
    );
  });

  it("should handle templates with no variables", () => {
    const template = "Hello World!";
    const variables: TemplateVariables = {};
    expect(renderTemplate(template, variables)).toBe("Hello World!");
  });

  it("should handle complex multiline templates", () => {
    const template = `
Content: {{content}}

Claims:
{{claims}}

Results:
{{searchResults}}
`;
    const variables: TemplateVariables = {
      content: "Test content",
      claims: ["Claim 1", "Claim 2"],
      searchResults: ["Result 1", "Result 2"],
    };
    expect(renderTemplate(template, variables)).toBe(`
Content: Test content

Claims:
Claim 1
Claim 2

Results:
Result 1
Result 2
`);
  });
});

describe("hasTemplateVariables", () => {
  it("should return true for templates with variables", () => {
    expect(hasTemplateVariables("Hello {{name}}!")).toBe(true);
  });

  it("should return false for templates without variables", () => {
    expect(hasTemplateVariables("Hello World!")).toBe(false);
  });

  it("should detect variables with whitespace", () => {
    expect(hasTemplateVariables("Hello {{ name }}!")).toBe(true);
  });

  it("should return false for empty string", () => {
    expect(hasTemplateVariables("")).toBe(false);
  });
});

describe("extractTemplateVariables", () => {
  it("should extract single variable", () => {
    const variables = extractTemplateVariables("Hello {{name}}!");
    expect(variables).toEqual(["name"]);
  });

  it("should extract multiple variables", () => {
    const variables = extractTemplateVariables(
      "{{greeting}} {{name}}, age {{age}}"
    );
    expect(variables).toEqual(["greeting", "name", "age"]);
  });

  it("should extract unique variables only", () => {
    const variables = extractTemplateVariables("{{name}} and {{name}} again");
    expect(variables).toEqual(["name"]);
  });

  it("should trim whitespace from variable names", () => {
    const variables = extractTemplateVariables("{{ name }} and {{ age }}");
    expect(variables).toEqual(["name", "age"]);
  });

  it("should return empty array for templates without variables", () => {
    const variables = extractTemplateVariables("Hello World!");
    expect(variables).toEqual([]);
  });

  it("should extract variables from multiline templates", () => {
    const template = `
Line 1: {{var1}}
Line 2: {{var2}}
Line 3: {{var1}}
`;
    const variables = extractTemplateVariables(template);
    expect(variables).toEqual(["var1", "var2"]);
  });
});
