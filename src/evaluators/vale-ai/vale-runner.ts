/**
 * ValeRunner - Spawns Vale CLI and parses JSON output
 * 
 * This class handles Vale CLI integration including:
 * - Checking if Vale is installed
 * - Retrieving Vale version
 * - Running Vale with JSON output
 * - Parsing Vale's JSON output
 * - Error handling for various failure scenarios
 */

import { spawn } from 'child_process';
import { ValeOutput } from './types.js';

export class ValeRunner {
  /**
   * Check if Vale is installed and available in PATH
   * @returns true if Vale is installed, false otherwise
   */
  isInstalled(): boolean {
    try {
      const result = spawn('vale', ['--version'], { 
        stdio: 'pipe',
        shell: true 
      });
      
      let found = false;
      result.on('spawn', () => {
        found = true;
      });
      
      result.on('error', () => {
        found = false;
      });
      
      // Wait briefly for spawn event
      const start = Date.now();
      while (Date.now() - start < 100) {
        // Busy wait
      }
      
      return found;
    } catch {
      return false;
    }
  }

  /**
   * Get Vale version string
   * @returns Vale version (e.g., "2.29.0") or empty string if not installed
   */
  async getVersion(): Promise<string> {
    return new Promise((resolve) => {
      const valeProcess = spawn('vale', ['--version'], { 
        stdio: 'pipe',
        shell: true 
      });
      
      let output = '';
      
      valeProcess.stdout.on('data', (data: Buffer) => {
        output += data.toString();
      });
      
      valeProcess.on('close', (code: number | null) => {
        if (code === 0) {
          // Vale outputs "vale version X.Y.Z"
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
   * @param files Optional array of file paths to check. If not provided, Vale uses its own file discovery
   * @returns Parsed Vale output as ValeOutput object
   * @throws Error if Vale is not installed, configuration error, or JSON parse error
   */
  async run(files?: string[]): Promise<ValeOutput> {
    // Check if Vale is installed first
    if (!this.isInstalled()) {
      throw this.createValeNotInstalledError();
    }

    return new Promise((resolve, reject) => {
      // Build Vale command arguments
      const args = ['--output=JSON'];
      
      // Add files if provided, otherwise Vale will use its own discovery
      if (files && files.length > 0) {
        args.push(...files);
      }
      
      const valeProcess = spawn('vale', args, {
        stdio: 'pipe',
        shell: true
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
        // Vale exit codes:
        // 0 = no issues found
        // 1 = issues found
        // 2 = error occurred
        
        if (code === 2) {
          // Configuration or execution error
          reject(this.createValeConfigError(stderr));
          return;
        }
        
        // Check for missing .vale.ini warning
        if (stderr.includes('.vale.ini') || stderr.includes('config')) {
          console.warn(this.createMissingConfigWarning());
        }
        
        // Parse JSON output
        try {
          if (!stdout.trim()) {
            // No output means no findings
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
