import { spawn, execSync } from 'child_process';
import { ValeOutput } from './types';

/**
 * Handles Vale CLI execution and output parsing
 */
export class ValeRunner {
  /**
   * Check if Vale is installed and available in PATH
   * 
   * This method attempts to execute Vale with the --version flag
   * to verify it's accessible in the system PATH.
   * 
   * @returns true if Vale is installed and accessible, false otherwise
   * 
   */
  isInstalled(): boolean {
    try {
      execSync('vale --version', { 
        stdio: 'pipe'
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get Vale version string
   * 
   * Executes `vale --version` and parses the version number.
   * 
   * @returns Vale version (e.g., "2.29.0") or empty string if not installed
   * 
   */
  async getVersion(): Promise<string> {
    return new Promise((resolve) => {
      const valeProcess = spawn('vale', ['--version'], { 
        stdio: 'pipe'
      });
      
      let output = '';
      
      valeProcess.stdout.on('data', (data: Buffer) => {
        output += data.toString();
      });
      
      valeProcess.on('close', (code: number | null) => {
        if (code === 0) {
          const match = output.match(/vale version ([\d.]+)/i);
          resolve(match?.[1] ?? output.trim());
        } else {
          resolve('');
        }
      });
      
      valeProcess.on('error', () => {
        resolve('');
      });
    });
  }

  /**
   * Run Vale CLI with JSON output
   * 
   * Spawns Vale as a subprocess with the --output=JSON flag and parses
   * the results. Vale's exit codes are:
   * - 0: No issues found
   * - 1: Issues found (not an error)
   * - 2: Execution error (configuration, file not found, etc.)
   * 
   * @param files - Optional array of file paths to check. If not provided,
   *                Vale uses its own file discovery based on .vale.ini
   * @returns Parsed Vale output as ValeOutput object mapping filenames to issues
   * 
   * @throws Error if Vale is not installed (with platform-specific installation instructions)
   * @throws Error if Vale configuration is invalid (with Vale's error message)
   * @throws Error if JSON output cannot be parsed (with raw output for debugging)
   * 
   * @example
   * ```typescript
   * const runner = new ValeRunner();
   * 
   */
  async run(files?: string[]): Promise<ValeOutput> {
    if (!this.isInstalled()) {
      throw this.createValeNotInstalledError();
    }

    return new Promise((resolve, reject) => {
      const args = ['--output=JSON'];
    
      if (files && files.length > 0) {
        args.push(...files);
      }
      
      const valeProcess = spawn('vale', args, {
        stdio: 'pipe'
      });
      
      let stdout = '';
      let stderr = '';
      
      valeProcess.stdout.on('data', (data: Buffer) => {
        stdout += data.toString();
      });
      
      valeProcess.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
      });
      
      valeProcess.on('close', (code: number | null) => {

        if (code === 2) {
          reject(this.createValeConfigError(stderr));
          return;
        }
        
        if (stderr.includes('.vale.ini') || stderr.includes('config')) {
          console.warn(this.createMissingConfigWarning());
        }
        
        try {
          if (!stdout.trim()) {
            resolve({});
            return;
          }
          
          const valeOutput: ValeOutput = JSON.parse(stdout);
          resolve(valeOutput);
        } catch (error) {
          reject(this.createJsonParseError(stdout, error));
        }
      });
      
      valeProcess.on('error', (error: Error) => {
        if (error.message.includes('ENOENT')) {
          reject(this.createValeNotInstalledError());
        } else {
          reject(new Error(`Failed to spawn Vale process: ${error.message}`));
        }
      });
    });
  }

  /**
   * Create error for Vale not installed
   * 
   * Generates a helpful error message with platform-specific installation
   * instructions for macOS, Linux, and Windows.
   * 
   * @returns Error with installation instructions
   */
  private createValeNotInstalledError(): Error {
    const platform = process.platform;
    let instructions = '';
    
    if (platform === 'darwin') {
      instructions = 'macOS:   brew install vale';
    } else if (platform === 'linux') {
      instructions = 'Linux:   See https://vale.sh/docs/vale-cli/installation/';
    } else if (platform === 'win32') {
      instructions = 'Windows: choco install vale';
    } else {
      instructions = 'See https://vale.sh/docs/vale-cli/installation/';
    }
    
    return new Error(
      `Vale is not installed or not in PATH.\n\n` +
      `Install Vale:\n  ${instructions}\n\n` +
      `After installation, run: vectorlint vale-ai`
    );
  }

  /**
   * Create error for Vale configuration issues
   * 
   * Wraps Vale's stderr output in a user-friendly error message.
   * 
   * @param stderr - Vale's error output from stderr
   * @returns Error with Vale's configuration error message
   */
  private createValeConfigError(stderr: string): Error {
    return new Error(
      `Vale configuration error\n\n` +
      `Vale says:\n  ${stderr.trim()}\n\n` +
      `Fix your .vale.ini and try again.`
    );
  }

  /**
   * Create warning message for missing .vale.ini
   * 
   * Generates a warning when Vale cannot find a configuration file,
   * with instructions on how to create one.
   * 
   * @returns Warning message string
   */
  private createMissingConfigWarning(): string {
    return (
      `Warning: No .vale.ini found in current directory or parents.\n\n` +
      `Vale will use default configuration. To customize:\n` +
      `  1. Create .vale.ini in your project root\n` +
      `  2. See https://vale.sh/docs/topics/config/\n\n` +
      `Continuing with defaults...`
    );
  }

  /**
   * Create error for JSON parse failures
   * 
   * Generates an error when Vale's JSON output cannot be parsed,
   * including the parse error and a preview of the raw output.
   * 
   * @param rawOutput - Raw stdout from Vale
   * @param error - The JSON parse error
   * @returns Error with parse details and output preview
   */
  private createJsonParseError(rawOutput: string, error: unknown): Error {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return new Error(
      `Failed to parse Vale JSON output\n\n` +
      `Parse error: ${errorMessage}\n\n` +
      `Raw output:\n${rawOutput.substring(0, 500)}${rawOutput.length > 500 ? '...' : ''}`
    );
  }
}
