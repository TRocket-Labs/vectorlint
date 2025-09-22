import { LLMProvider } from '../providers/LLMProvider.js';
import { AnalysisResult } from './types.js';

export class ContentAnalyzer {
  constructor(private provider: LLMProvider) {}

  async analyzeFile(filePath: string, content: string): Promise<AnalysisResult> {
    return await this.provider.analyze(content);
  }
}
