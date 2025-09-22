import { AnalysisResult } from '../analyzer/types.js';

export interface LLMProvider {
  analyze(content: string): Promise<AnalysisResult>;
}
