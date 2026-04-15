import { generateText, Output, NoObjectGeneratedError, stepCountIs, tool } from 'ai';
import type { LanguageModel } from 'ai';
import { z } from 'zod';
import pLimit from 'p-limit';
import { AgentToolLoopParams, AgentToolLoopResult, LLMProvider, LLMResult } from './llm-provider';
import { DefaultRequestBuilder, RequestBuilder } from './request-builder';
import { createNoopLogger, type Logger } from '../logging/logger';
import type { AIExecutionContext, AIObservability } from '../observability/ai-observability';

export interface VercelAIConfig {
  model: LanguageModel;
  temperature?: number;
  maxTokens?: number;
  debug?: boolean;
  showPrompt?: boolean;
  showPromptTrunc?: boolean;
  logger?: Logger;
  observability?: AIObservability;
}

export class VercelAIProvider implements LLMProvider {
  private config: VercelAIConfig;
  private builder: RequestBuilder;
  private logger: Logger;
  private observability?: AIObservability;

  constructor(config: VercelAIConfig, builder?: RequestBuilder) {
    this.config = {
      ...config,
      temperature: config.temperature ?? 0.2,
      ...(config.maxTokens !== undefined && { maxTokens: config.maxTokens }),
    };
    this.builder = builder ?? new DefaultRequestBuilder();
    this.logger = config.logger ?? createNoopLogger();
    this.observability = config.observability;
  };

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
      this.logger.debug('[vectorlint] Sending request via Vercel AI SDK', {
        model: this.config.model,
        temperature: this.config.temperature,
        ...(this.config.maxTokens !== undefined && { maxTokens: this.config.maxTokens }),
      });

      if (this.config.showPrompt) {
        this.logger.debug('[vectorlint] System prompt (full)');
        this.logger.debug(systemPrompt);
        this.logger.debug('[vectorlint] User content (full)');
        this.logger.debug(content);
      } else if (this.config.showPromptTrunc) {
        this.logger.debug('[vectorlint] System prompt (first 500 chars)');
        this.logger.debug(systemPrompt.slice(0, 500));
        if (systemPrompt.length > 500) this.logger.debug('... [truncated]');
        const preview = content.slice(0, 500);
        this.logger.debug('[vectorlint] User content preview (first 500 chars)');
        this.logger.debug(preview);
        if (content.length > 500) this.logger.debug('... [truncated]');
      }
    }

    try {
      const observabilityOptions = this.getObservabilityOptions({
        operation: 'structured-eval',
        provider: this.resolveProviderName(),
        model: this.resolveModelName(),
        evaluator: this.extractContextValue(context, 'evaluatorName', 'evaluator'),
        rule: this.extractContextValue(context, 'ruleName', 'rule'),
      });

      const result = await generateText({
        model: this.config.model,
        system: systemPrompt,
        prompt: `Input:\n\n${content}`,
        ...(this.config.temperature !== undefined && { temperature: this.config.temperature }),
        ...(this.config.maxTokens !== undefined && { maxTokens: this.config.maxTokens }),
        ...observabilityOptions,
        output: Output.object({
          schema: zodSchema,
        }),
      });

      if (this.config.debug && result.usage) {
        this.logger.debug('[vectorlint] LLM response meta', {
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

  runAgentToolLoop = async (params: AgentToolLoopParams): Promise<AgentToolLoopResult> => {
    const maxParallel = params.maxParallelToolCalls ?? 1;
    const limit = pLimit(maxParallel);

    const mappedTools = Object.fromEntries(
      Object.entries(params.tools).map(([name, definition]) => [
        name,
        tool({
          description: definition.description,
          inputSchema: definition.inputSchema as z.ZodType,
          execute: (input: unknown) => limit(() => definition.execute(input)),
        }),
      ])
    );

    const result = await generateText({
      model: this.config.model,
      system: params.systemPrompt,
      prompt: params.prompt,
      ...(params.maxRetries !== undefined ? { maxRetries: params.maxRetries } : {}),
      ...this.getObservabilityOptions({
        operation: 'agent-tool-loop',
        provider: this.resolveProviderName(),
        model: this.resolveModelName(),
      }),
      stopWhen: stepCountIs(params.maxSteps ?? 1000),
      providerOptions: {
        openai: {
          parallelToolCalls: maxParallel > 1,
        },
      },
      tools: mappedTools,
    });

    if (this.config.debug) {
      for (const [i, step] of result.steps.entries()) {
        const toolNames = step.toolCalls.map((c) => c.toolName).join(', ') || '(none)';
        this.logger.debug(
          `[agent] step ${i + 1}: finishReason=${step.finishReason} tools=[${toolNames}]`
        );
        if (step.text) {
          this.logger.debug(
            `[agent] step ${i + 1} text: ${step.text.slice(0, 500)}${step.text.length > 500 ? '...' : ''}`
          );
        }
      }
      this.logger.debug(`[agent] final finishReason=${result.finishReason} steps=${result.steps.length}`);
      if (result.text) {
        this.logger.debug(
          `[agent] final text: ${result.text.slice(0, 500)}${result.text.length > 500 ? '...' : ''}`
        );
      }
    }

    return {
      usage: result.usage
        ? {
          inputTokens: result.usage.inputTokens ?? 0,
          outputTokens: result.usage.outputTokens ?? 0,
        }
        : undefined,
    };
  }

  private getObservabilityOptions(context: AIExecutionContext): Record<string, unknown> {
    if (!this.observability) {
      return {};
    }

    try {
      return this.observability.decorateCall(context);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.warn('[vectorlint] Failed to decorate AI call for observability; continuing without telemetry options', {
        error: err.message,
        operation: context.operation,
      });
      return {};
    }
  }

  private resolveProviderName(): string {
    const model = this.config.model as unknown as Record<string, unknown>;
    const provider = model.provider;
    if (typeof provider === 'string' && provider.length > 0) {
      return provider;
    }
    return 'unknown';
  }

  private resolveModelName(): string {
    const model = this.config.model as unknown as Record<string, unknown>;
    for (const key of ['modelId', 'model', 'id']) {
      const value = model[key];
      if (typeof value === 'string' && value.length > 0) {
        return value;
      }
    }
    return 'unknown';
  }

  private extractContextValue(
    context: import('./request-builder').EvalContext | undefined,
    ...keys: string[]
  ): string | undefined {
    if (!context) {
      return undefined;
    }

    const contextRecord = context as unknown as Record<string, unknown>;
    for (const key of keys) {
      const value = contextRecord[key];
      if (typeof value === 'string' && value.length > 0) {
        return value;
      }
    }
    return undefined;
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
