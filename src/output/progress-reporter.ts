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
  private startTimeMs: number | undefined;

  constructor(options: ProgressReporterOptions = {}) {
    this.runningText = options.runningText ?? '◆ analyzing...';
    this.doneText = options.doneText ?? '◆ done';
    this.intervalMs = options.intervalMs ?? 125;
    this.isTty = Boolean(process.stderr.isTTY);
  }

  start(): void {
    if (!this.isTty) return;
    this.startTimeMs = Date.now();
    this.render(true);
    this.timer = setInterval(() => this.render(false), this.intervalMs);
    this.timer.unref?.();
  }

  setRunningText(text: string): void {
    if (text === this.runningText) return;
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

    const elapsedMs = this.startTimeMs === undefined ? 0 : Math.max(0, Date.now() - this.startTimeMs);
    process.stderr.write(`\r\x1b[2K${this.doneText} in ${formatDuration(elapsedMs)}\n`);
    this.startTimeMs = undefined;
  }

  private render(force: boolean): void {
    if (!this.isTty) return;
    if (!force && !this.timer) return;
    const frame = this.frames[this.frameIndex % this.frames.length] || '|';
    this.frameIndex += 1;
    process.stderr.write(`\r\x1b[2K${frame} ${this.runningText}`);
  }
}

function formatDuration(elapsedMs: number): string {
  const totalSeconds = Math.floor(elapsedMs / 1000);
  if (totalSeconds < 1) return '<1s';

  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  if (totalMinutes < 1) return `${seconds}s`;

  const minutes = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);
  if (hours < 1) {
    return seconds === 0 ? `${minutes}m` : `${minutes}m ${seconds}s`;
  }

  if (minutes === 0 && seconds === 0) return `${hours}h`;
  if (seconds === 0) return `${hours}h ${minutes}m`;
  return `${hours}h ${minutes}m ${seconds}s`;
}
