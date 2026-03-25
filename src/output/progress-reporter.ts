export interface ProgressReporterOptions {
  runningText?: string;
  doneText?: string;
  intervalMs?: number;
}

export class ProgressReporter {
  private runningText: string;
  private readonly doneText: string;
  private readonly intervalMs: number;
  private readonly isTty: boolean;
  private readonly frames = ['|', '/', '-', '\\'];

  private frameIndex = 0;
  private timer: NodeJS.Timeout | undefined;

  constructor(options: ProgressReporterOptions = {}) {
    this.runningText = options.runningText ?? '[vectorlint] analyzing...';
    this.doneText = options.doneText ?? '[vectorlint] done.';
    this.intervalMs = options.intervalMs ?? 125;
    this.isTty = Boolean(process.stderr.isTTY);
  }

  start(): void {
    if (!this.isTty) return;
    this.render(true);
    this.timer = setInterval(() => this.render(false), this.intervalMs);
    this.timer.unref?.();
  }

  setRunningText(text: string): void {
    this.runningText = text;
    if (!this.isTty) return;
    this.render(true);
  }

  stop(): void {
    if (!this.isTty) return;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }

    process.stderr.write(`\r\x1b[2K${this.doneText}\n`);
  }

  private render(force: boolean): void {
    if (!this.isTty) return;
    if (!force && !this.timer) return;
    const frame = this.frames[this.frameIndex % this.frames.length] || '|';
    this.frameIndex += 1;
    process.stderr.write(`\r\x1b[2K${frame} ${this.runningText}`);
  }
}
