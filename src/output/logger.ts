/**
 * Logger utility for VectorLint
 * 
 * Provides console output functions that can be silenced for machine-readable
 * output formats (rdjson, json). This follows Vale's approach where machine-readable
 * formats output ONLY the structured data to stdout with no other logs.
 */

let silentMode = false;

/**
 * Enable or disable silent mode.
 * When enabled, log() and warn() output nothing.
 * error() always outputs to stderr.
 */
export function setSilentMode(silent: boolean): void {
    silentMode = silent;
}

/**
 * Get current silent mode status.
 */
export function isSilentMode(): boolean {
    return silentMode;
}

/**
 * Log to stdout. Silenced in silent mode.
 */
export function log(...args: unknown[]): void {
    if (!silentMode) {
        console.log(...args);
    }
}

/**
 * Log warning to stderr. Silenced in silent mode.
 */
export function warn(...args: unknown[]): void {
    if (!silentMode) {
        console.warn(...args);
    }
}

/**
 * Log error to stderr. ALWAYS outputs (never silenced).
 */
export function error(...args: unknown[]): void {
    console.error(...args);
}
