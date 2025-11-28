/**
 * Template rendering utility for prompts.
 * Supports Mustache-style variable interpolation: {{variableName}}
 *
 * Variables can contain:
 * - Simple strings
 * - Arrays (joined with newlines)
 * - Objects (converted to JSON)
 */

export type TemplateVariables = Record<
  string,
  string | string[] | object | number | boolean
>;

/**
 * Renders a template string by replacing {{variableName}} placeholders with values.
 *
 * @param template - The template string containing {{variable}} placeholders
 * @param variables - Object containing variable values to interpolate
 * @returns The rendered string with all variables replaced
 * @throws Error if a variable is referenced but not provided
 */
export function renderTemplate(
  template: string,
  variables: TemplateVariables
): string {
  // Match {{variableName}} patterns
  const templatePattern = /\{\{(\s*[\w.]+\s*)\}\}/g;

  return template.replace(
    templatePattern,
    (_match: string, variableName: string) => {
      const trimmedName = variableName.trim();

      if (!(trimmedName in variables)) {
        throw new Error(
          `Template variable '${trimmedName}' is not defined. Available variables: ${Object.keys(
            variables
          ).join(", ")}`
        );
      }

      const value = variables[trimmedName] as
        | string
        | string[]
        | object
        | number
        | boolean;

      // Handle different value types
      if (Array.isArray(value)) {
        return value.join("\n");
      }

      if (typeof value === "object" && value !== null) {
        return JSON.stringify(value, null, 2);
      }

      if (value === null || value === undefined) {
        return "";
      }

      return String(value);
    }
  );
}

/**
 * Checks if a template string contains any variable placeholders.
 *
 * @param template - The template string to check
 * @returns True if the template contains {{variable}} placeholders
 */
export function hasTemplateVariables(template: string): boolean {
  const templatePattern = /\{\{(\s*[\w.]+\s*)\}\}/;
  return templatePattern.test(template);
}

/**
 * Extracts all variable names from a template string.
 *
 * @param template - The template string to analyze
 * @returns Array of unique variable names found in the template
 */
export function extractTemplateVariables(template: string): string[] {
  const templatePattern = /\{\{(\s*[\w.]+\s*)\}\}/g;
  const variables = new Set<string>();

  let match;
  while ((match = templatePattern.exec(template)) !== null) {
    if (match[1]) {
      variables.add(match[1].trim());
    }
  }

  return Array.from(variables);
}
