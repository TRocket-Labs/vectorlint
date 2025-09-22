import { AzureOpenAI } from 'openai';
import { LLMProvider } from './LLMProvider.js';
import { AnalysisResult, Issue } from '../analyzer/types.js';

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

  async analyze(content: string): Promise<AnalysisResult> {
    // Simple grammar check prompt
    const prompt = `Check for grammar errors in this content. Return a JSON array of issues with this exact structure:
[
  {
    "line": 1,
    "severity": "error",
    "message": "Grammar error description",
    "rule": "grammar"
  }
]

If no errors are found, return an empty array: []

Content to check:
${content}`;

    const params: Parameters<typeof this.client.chat.completions.create>[0] = {
      model: this.deploymentName,
      messages: [
        { role: 'system', content: 'You are a grammar checker. Return only valid JSON.' },
        { role: 'user', content: prompt }
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
      }
    }

    const response = await this.client.chat.completions.create(params);

    const responseTextRaw = response.choices[0]?.message?.content;
    const responseText = (responseTextRaw ?? '').trim();
    if (this.debug) {
      console.log('[vectorlint] LLM response content:', responseText);
      const usage = (response as any).usage;
      const finish = response.choices[0]?.finish_reason;
      if (usage || finish) {
        console.log('[vectorlint] LLM response meta:', { usage, finish_reason: finish });
      }
      if (this.debugJson) {
        try {
          console.log('[vectorlint] Full JSON response:');
          console.log(JSON.stringify(response, null, 2));
        } catch {}
      }
    }
    if (!responseText) {
      throw new Error('Empty response from LLM (no content).');
    }

    try {
      const issues: Issue[] = JSON.parse(responseText);
      return { issues };
    } catch (error) {
      const preview = responseText.slice(0, 200);
      throw new Error(`Failed to parse LLM response as JSON. Preview: ${preview}${responseText.length > 200 ? ' ...' : ''}`);
    }
  }
}
