import { VectorlintError } from '../errors';
import type { ReviewBudget } from './types';

export class BudgetExceededError extends VectorlintError {
  constructor(
    message: string,
    public readonly limit: keyof ReviewBudget,
    public readonly actual: number,
  ) {
    super(message, 'BUDGET_EXCEEDED');
    this.name = 'BudgetExceededError';
  }
}
