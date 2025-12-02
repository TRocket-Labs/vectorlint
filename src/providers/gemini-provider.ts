import { GoogleGenerativeAI, GenerativeModel, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';
import { LLMProvider } from './llm-provider';
import { DefaultRequestBuilder, RequestBuilder } from './request-builder';
import { handleUnknownError } from '../errors/index';

export interface GeminiConfig {
    apiKey: string;
    model?: string;
    temperature?: number;
    debug?: boolean;
    showPrompt?: boolean;
    showPromptTrunc?: boolean;
    debugJson?: boolean;
}

export const GeminiDefaultConfig = {
    model: 'gemini-2.5-flash',
    temperature: 0.2,
};

export class GeminiProvider implements LLMProvider {
    private client: GoogleGenerativeAI;
    private model: GenerativeModel;
    private config: GeminiConfig;
    private builder: RequestBuilder;

    constructor(config: GeminiConfig, builder?: RequestBuilder) {
        this.client = new GoogleGenerativeAI(config.apiKey);
        this.config = {
            ...config,
            model: config.model ?? GeminiDefaultConfig.model,
            temperature: config.temperature ?? GeminiDefaultConfig.temperature,
        };
        this.model = this.client.getGenerativeModel({
            model: this.config.model!,
            generationConfig: {
                ...(this.config.temperature !== undefined && { temperature: this.config.temperature }),
                responseMimeType: "application/json",
            }
        });
        this.builder = builder ?? new DefaultRequestBuilder();
    }

    async runPromptStructured<T = unknown>(
        content: string,
        promptText: string,
        schema: { name: string; schema: Record<string, unknown> }
    ): Promise<T> {
        const systemPrompt = this.builder.buildPromptBodyForStructured(promptText);

        const fullPrompt = `${systemPrompt}
            You must output valid JSON that adheres to the following schema:
            ${JSON.stringify(schema.schema, null, 2)}
            Input:
            ${content}
        `;

        if (this.config.debug) {
            console.error('[vectorlint] Sending request to Gemini:', {
                model: this.config.model,
                temperature: this.config.temperature,
            });
            if (this.config.showPrompt) {
                console.error('[vectorlint] Full prompt:');
                console.error(fullPrompt);
            } else if (this.config.showPromptTrunc) {
                console.error('[vectorlint] Prompt preview (first 500 chars):');
                console.error(fullPrompt.slice(0, 500));
                if (fullPrompt.length > 500) console.error('... [truncated]');
            }
        }

        try {
            const result = await this.model.generateContent(fullPrompt);
            const response = result.response;
            const text = response.text();

            if (this.config.debug && this.config.debugJson) {
                console.error('[vectorlint] Full JSON response:');
                console.error(text);
            }

            return JSON.parse(text) as T;
        } catch (e: unknown) {
            const err = handleUnknownError(e, 'Gemini API call');
            throw new Error(`Gemini API call failed: ${err.message}`);
        }
    }
}
