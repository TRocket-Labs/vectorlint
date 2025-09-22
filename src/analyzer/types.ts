export interface Issue {
  line: number;
  column?: number;
  severity: 'error' | 'warning' | 'info';
  message: string;
  rule: string;
}

export interface AnalysisResult {
  issues: Issue[];
}
