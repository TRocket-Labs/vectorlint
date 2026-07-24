import { VectorlintError } from '../errors';

export class TargetSectionRangeError extends VectorlintError {
  constructor(
    message: string,
    public readonly lineCount: number,
  ) {
    super(message, 'TARGET_SECTION_RANGE');
    this.name = 'TargetSectionRangeError';
  }
}
