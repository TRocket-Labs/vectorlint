import { generateText, Output, NoObjectGeneratedError } from 'ai';
import type { LanguageModel } from 'ai';
import { z } from 'zod';
import { LLMProvider, LLMResult } from './llm-provider';
import { DefaultRequestBuilder, RequestBuilder } from './request-builder';

export interface VercelAIConfig {
  model: LanguageModel;
  temperature?: number;
  debug?: boolean;
  showPrompt?: boolean;
  showPromptTrunc?: boolean;
}

export class VercelAIProvider implements LLMProvider {
  private config: VercelAIConfig;
  private builder: RequestBuilder;

  constructor(config: VercelAIConfig, builder?: RequestBuilder) {
    this.config = {
      ...config,
      temperature: config.temperature ?? 0.2,
    };
    this.builder = builder ?? new DefaultRequestBuilder();
  }

  async runPromptStructured<T = unknown>(
    content: string,
    promptText: string,
    schema: { name: string; schema: Record<string, unknown> }
  ): Promise<LLMResult<T>> {
    const systemPrompt = this.builder.buildPromptBodyForStructured(promptText);

    // Convert JSON Schema to Zod for Vercel AI SDK
    const zodSchema = this.jsonSchemaToZod(schema);

    if (this.config.debug) {
      console.log('[vectorlint] Sending request via Vercel AI SDK:', {
        model: this.config.model,
        temperature: this.config.temperature,
      });

      if (this.config.showPrompt) {
        console.log('[vectorlint] System prompt (full):');
        console.log(systemPrompt);
        console.log('[vectorlint] User content (full):');
        console.log(content);
      } else if (this.config.showPromptTrunc) {
        console.log('[vectorlint] System prompt (first 500 chars):');
        console.log(systemPrompt.slice(0, 500));
        if (systemPrompt.length > 500) console.log('... [truncated]');
        const preview = content.slice(0, 500);
        console.log('[vectorlint] User content preview (first 500 chars):');
        console.log(preview);
        if (content.length > 500) console.log('... [truncated]');
      }
    }

    try {
      // Vercel AI SDK v4.3.x: the parameter is `experimental_output` (renamed to `output` in v5+)
      const result = await generateText({
        model: this.config.model,
        system: systemPrompt,
        prompt: `Input:\n\n${content}`,
        temperature: this.config.temperature,
        experimental_output: Output.object({
          schema: zodSchema,
        }),
      });

      if (this.config.debug && result.usage) {
        console.log('[vectorlint] LLM response meta:', {
          usage: {
            prompt_tokens: result.usage.promptTokens,
            completion_tokens: result.usage.completionTokens,
            total_tokens: result.usage.totalTokens,
          },
          finish_reason: result.finishReason,
        });
      }

      // Map Vercel AI SDK usage (promptTokens/completionTokens)
      // to VectorLint TokenUsage (inputTokens/outputTokens)
      const usage = result.usage ? {
        inputTokens: result.usage.promptTokens,
        outputTokens: result.usage.completionTokens,
      } : undefined;

      // experimental_output is validated by the Zod schema passed to Output.object(),
      // but can be undefined/null if the LLM response doesn't match the schema
      const output = result.experimental_output;
      if (output === undefined || output === null) {
        throw new Error(
          `LLM returned no structured output. Raw text: ${result.text?.slice(0, 500) ?? '(empty)'}`
        );
      }

      const llmResult: LLMResult<T> = { data: output as T };
      if (usage) {
        llmResult.usage = usage;
      }
      return llmResult;
    } catch (e: unknown) {
      // Handle Vercel AI SDK's NoObjectGeneratedError with proper type narrowing
      if (NoObjectGeneratedError.isInstance(e)) {
        const rawText = e instanceof Error && 'text' in e ? String(e.text) : 'unknown';
        throw new Error(
          `LLM failed to generate valid structured output. Raw text: ${rawText}`
        );
      }
      const err = e instanceof Error ? e : new Error(String(e));
      throw new Error(`Vercel AI SDK call failed: ${err.message}`);
    }
  }

  /**
   * Entry point: converts the VectorLint schema wrapper to a Zod schema.
   * Schema format: { name: string, schema: { type, properties, required, ... } }
   */
  private jsonSchemaToZod(schema: { name: string; schema: Record<string, unknown> }): z.ZodType {
    return this.convertSchemaNode(schema.schema);
  }

  /**
   * Recursively converts a JSON Schema node to a Zod schema.
   * Handles nested objects, arrays with typed items, enums, and primitives.
   */
  private convertSchemaNode(node: Record<string, unknown>): z.ZodType {
    const type = node.type as string | undefined;
    const enumValues = node.enum as string[] | undefined;

    // Enums take priority over type (JSON Schema allows enum without type)
    if (enumValues) {
      return z.enum(enumValues as [string, ...string[]]);
    }

    switch (type) {
      case 'string':
        return z.string();
      case 'number':
      case 'integer':
        return z.number();
      case 'boolean':
        return z.boolean();
      case 'array': {
        const items = node.items as Record<string, unknown> | undefined;
        if (items) {
          return z.array(this.convertSchemaNode(items));
        }
        return z.array(z.unknown());
      }
      case 'object': {
        const properties = node.properties as Record<string, Record<string, unknown>> | undefined;
        const required = (node.required as string[]) || [];

        if (properties) {
          const zodFields: Record<string, z.ZodTypeAny> = {};
          for (const [key, value] of Object.entries(properties)) {
            const fieldSchema = this.convertSchemaNode(value);
            // Use .nullable() instead of .optional() — OpenAI strict structured
            // outputs don't support optional properties, only nullable ones
            zodFields[key] = required.includes(key) ? fieldSchema : fieldSchema.nullable();
          }
          return z.object(zodFields);
        }
        return z.record(z.unknown());
      }
      default:
        return z.unknown();
    }
  }
}
