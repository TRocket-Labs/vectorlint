import { spawn, execSync } from 'child_process';
import { VALE_OUTPUT_SCHEMA, type ValeOutput } from '../../schemas/vale-responses';

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
        // Exit code 2 indicates configuration or execution error
        if (code === 2) {
          reject(this.createValeConfigError(stderr));
          return;
        }
        
        // Warn about missing configuration but continue
        if (stderr.includes('.vale.ini') || stderr.includes('config')) {
          console.warn(this.missingConfigWarning());
        }
        
        try {
          if (!stdout.trim()) {
            resolve({});
            return;
          }
          
          const raw: unknown = JSON.parse(stdout);
          const valeOutput = VALE_OUTPUT_SCHEMA.parse(raw);
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
    let valeInstructions = 'See https://vale.sh/docs/vale-cli/installation/';
    const valeWindowInstructions = 'Windows: choco install vale';
    const valeLinuxInstructions = 'Linux:   See https://vale.sh/docs/vale-cli/installation/';
    const valeMacOsInstructions = 'macOS:   brew install vale';
    if (platform === 'darwin') {
      valeInstructions = valeMacOsInstructions
    } else if (platform === 'linux') {
      valeInstructions = valeLinuxInstructions
    } else if (platform === 'win32') {
      valeInstructions = valeWindowInstructions
    }
    
    return new Error(
      `Vale is not installed or not in PATH.\n\n` +
      `Install Vale:\n  ${valeInstructions}\n\n` +
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
  private missingConfigWarning(): string {
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