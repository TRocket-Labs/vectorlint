import { AzureOpenAI } from 'openai';
import { LLMProvider } from './LLMProvider.js';
import { AnalysisResult, Issue } from '../analyzer/types.js';

export interface AzureOpenAIConfig {
  apiKey: string;
  endpoint: string;
  deploymentName: string;
  apiVersion?: string;
  temperature?: number;
}

export class AzureOpenAIProvider implements LLMProvider {
  private client: AzureOpenAI;
  private deploymentName: string;
  private temperature?: number;

  constructor(config: AzureOpenAIConfig) {
    this.client = new AzureOpenAI({
      apiKey: config.apiKey,
      endpoint: config.endpoint,
      apiVersion: config.apiVersion || '2024-02-15-preview',
    });
    this.deploymentName = config.deploymentName;
    this.temperature = config.temperature;
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

    const response = await this.client.chat.completions.create(params);

    const responseText = response.choices[0]?.message?.content || '[]';
    
    try {
      const issues: Issue[] = JSON.parse(responseText);
      return { issues };
    } catch (error) {
      console.error('Failed to parse LLM response:', responseText);
      return { issues: [] };
    }
  }
}
