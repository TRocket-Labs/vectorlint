import { z } from "zod";
import promptsData from "./prompts.json";

/**
 * Schema for evaluator prompts JSON file.
 * Simple key-value mapping: prompt key -> prompt content string.
 */
const PROMPTS_SCHEMA = z.record(z.string(), z.string());

const PROMPTS = PROMPTS_SCHEMA.parse(promptsData);

/**
 * Get an evaluator prompt by key.
 * Evaluators call this with their known prompt key to retrieve the prompt content.
 *
 * @param key - The prompt key (e.g., "claim-extraction")
 * @returns The prompt content string
 * @throws Error if the prompt key is not found
 */
export function getPrompt(key: string): string {
  const prompt = PROMPTS[key];
  if (!prompt) {
    const available = Object.keys(PROMPTS).join(", ");
    throw new Error(
      `Prompt '${key}' not found. Available prompts: ${available || "none"}`
    );
  }
  return prompt;
}
