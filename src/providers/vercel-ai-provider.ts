import { generateText, Output, NoObjectGeneratedError } from 'ai';
import type { LanguageModel } from 'ai';
import { z } from 'zod';
import { LLMProvider, LLMResult } from './llm-provider';
import { DefaultRequestBuilder, RequestBuilder } from './request-builder';

export interface VercelAIConfig {
  model: LanguageModel;
  temperature?: number;
  maxTokens?: number;
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
      ...(config.maxTokens !== undefined && { maxTokens: config.maxTokens }),
    };
    this.builder = builder ?? new DefaultRequestBuilder();
  }

  getModel(): LanguageModel {
    return this.config.model;
  }

  async runPromptStructured<T = unknown>(
    content: string,
    promptText: string,
    schema: { name: string; schema: Record<string, unknown> },
    context?: import('./request-builder').EvalContext
  ): Promise<LLMResult<T>> {
    const systemPrompt = this.builder.buildPromptBodyForStructured(promptText, context);

    // Convert JSON Schema to Zod for Vercel AI SDK
    const zodSchema = this.jsonSchemaToZod(schema);

    if (this.config.debug) {
      console.log('[vectorlint] Sending request via Vercel AI SDK:', {
        model: this.config.model,
        temperature: this.config.temperature,
        ...(this.config.maxTokens !== undefined && { maxTokens: this.config.maxTokens }),
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
      const result = await generateText({
        model: this.config.model,
        system: systemPrompt,
        prompt: `Input:\n\n${content}`,
        ...(this.config.temperature !== undefined && { temperature: this.config.temperature }),
        ...(this.config.maxTokens !== undefined && { maxTokens: this.config.maxTokens }),
        output: Output.object({
          schema: zodSchema,
        }),
      });

      if (this.config.debug && result.usage) {
        console.log('[vectorlint] LLM response meta:', {
          usage: {
            input_tokens: result.usage.inputTokens,
            output_tokens: result.usage.outputTokens,
            total_tokens: result.usage.totalTokens,
          },
          finish_reason: result.finishReason,
        });
      }

      const usage = result.usage ? {
        inputTokens: result.usage.inputTokens ?? 0,
        outputTokens: result.usage.outputTokens ?? 0,
      } : undefined;

      const output: unknown = result.output;
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
    let type = node.type as string | string[] | undefined;
    const enumValues = node.enum as string[] | undefined;
    const isNullable = node.nullable === true || (Array.isArray(type) && type.includes('null'));

    // Normalize type array: remove 'null' (tracked via isNullable) and handle multi-type unions
    if (Array.isArray(type)) {
      const types = type.filter(t => t !== 'null');
      if (types.length === 0) {
        type = undefined;
      } else if (types.length === 1) {
        type = types[0];
      } else {
        // Multi-type (e.g. ['string','number']): build a union of each type's Zod schema
        const schemas = types.map(t => this.convertSchemaNode({ ...node, type: t, enum: undefined }));
        const unionSchema = z.union(schemas as unknown as [z.ZodTypeAny, z.ZodTypeAny, ...z.ZodTypeAny[]]);
        return isNullable ? unionSchema.nullable() : unionSchema;
      }
    }

    // Enums take priority over type (JSON Schema allows enum without type)
    if (enumValues) {
      let enumSchema: z.ZodType;
      const allStrings = enumValues.every((v): v is string => typeof v === 'string');
      if (allStrings && enumValues.length > 0) {
        enumSchema = z.enum(enumValues as [string, ...string[]]);
      } else {
        // Mixed or non-string enums: build a union of literals
        const literals = (enumValues as unknown[]).map(v => z.literal(v as z.Primitive));
        enumSchema = literals.length === 1
          ? literals[0]!
          : z.union(literals as unknown as [z.ZodTypeAny, z.ZodTypeAny, ...z.ZodTypeAny[]]);
      }
      return isNullable ? enumSchema.nullable() : enumSchema;
    }

    let schema: z.ZodType;
    switch (type) {
      case 'string':
        schema = z.string();
        break;
      case 'number':
      case 'integer':
        schema = z.number();
        break;
      case 'boolean':
        schema = z.boolean();
        break;
      case 'array': {
        const items = node.items as Record<string, unknown> | undefined;
        if (items) {
          schema = z.array(this.convertSchemaNode(items));
        } else {
          schema = z.array(z.unknown());
        }
        break;
      }
      case 'object': {
        const properties = node.properties as Record<string, Record<string, unknown>> | undefined;
        const required = (node.required as string[]) || [];
        const additionalProperties = node.additionalProperties;

        if (properties) {
          const zodFields: Record<string, z.ZodTypeAny> = {};
          for (const [key, value] of Object.entries(properties)) {
            const fieldSchema = this.convertSchemaNode(value);
            zodFields[key] = required.includes(key) ? fieldSchema : fieldSchema.optional();
          }
          let objSchema: z.ZodType = z.object(zodFields);
          if (additionalProperties === false) {
            objSchema = z.object(zodFields).strict();
          }
          schema = objSchema;
        } else {
          schema = z.record(z.unknown());
        }
        break;
      }
      default:
        schema = z.unknown();
    }

    return isNullable ? schema.nullable() : schema;
  }
}
