import { AzureOpenAI } from 'openai';
import { LLMProvider } from './LLMProvider.js';

export interface AzureOpenAIConfig {
  apiKey: string;
  endpoint: string;
  deploymentName: string;
  apiVersion?: string;
  temperature?: number;
  debug?: boolean;
  showPrompt?: boolean;
  debugJson?: boolean;
}

export class AzureOpenAIProvider implements LLMProvider {
  private client: AzureOpenAI;
  private deploymentName: string;
  private temperature?: number;
  private apiVersion?: string;
  private debug?: boolean;
  private showPrompt?: boolean;
  private debugJson?: boolean;

  constructor(config: AzureOpenAIConfig) {
    this.client = new AzureOpenAI({
      apiKey: config.apiKey,
      endpoint: config.endpoint,
      apiVersion: config.apiVersion || '2024-02-15-preview',
    });
    this.deploymentName = config.deploymentName;
    this.temperature = config.temperature;
    this.apiVersion = config.apiVersion;
    this.debug = config.debug;
    this.showPrompt = config.showPrompt;
    this.debugJson = config.debugJson;
  }

  async runPrompt(content: string, promptText: string): Promise<string> {
    const prompt = promptText;

    const params: Parameters<typeof this.client.chat.completions.create>[0] = {
      model: this.deploymentName,
      messages: [
        { role: 'system', content: 'Follow the instructions precisely and respond accordingly.' },
        { role: 'user', content: prompt },
        { role: 'user', content: `Input:\n\n${content}` }
      ],
    };
    if (this.temperature !== undefined) {
      // Allow server to reject unsupported temperatures (e.g., custom models)
      params.temperature = this.temperature;
    }

    if (this.debug) {
      console.log('[vectorlint] Sending request to Azure OpenAI:', {
        model: this.deploymentName,
        apiVersion: this.apiVersion || '2024-02-15-preview',
        temperature: this.temperature,
      });
      if (this.showPrompt) {
        console.log('[vectorlint] Prompt (first 500 chars):');
        console.log(prompt.slice(0, 500));
        if (prompt.length > 500) console.log('... [truncated]');
        const preview = content.slice(0, 500);
        console.log('[vectorlint] Injected content preview (first 500 chars):');
        console.log(preview);
        if (content.length > 500) console.log('... [truncated]');
      }
    }

    const response = await this.client.chat.completions.create(params);

    const anyResp: any = response as any;
    const responseTextRaw = anyResp.choices?.[0]?.message?.content;
    const responseText = (responseTextRaw ?? '').trim();
    if (this.debug) {
      const usage = anyResp.usage;
      const finish = anyResp.choices?.[0]?.finish_reason;
      if (usage || finish) {
        console.log('[vectorlint] LLM response meta:', { usage, finish_reason: finish });
      }
      if (this.debugJson) {
        try {
          console.log('[vectorlint] Full JSON response:');
          console.log(JSON.stringify(anyResp, null, 2));
        } catch {}
      }
    }
    if (!responseText) {
      throw new Error('Empty response from LLM (no content).');
    }
    return responseText;
  }
}
