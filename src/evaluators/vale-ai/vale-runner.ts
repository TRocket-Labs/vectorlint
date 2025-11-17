import { spawn, execSync } from 'child_process';
import { ValeOutput } from './types';

/**
 * Handles Vale CLI execution and output parsing
 */
export class ValeRunner {

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

        if (code === 2) {
          reject(this.createValeConfigError(stderr));
          return;
        }
        
        if (stderr.includes('.vale.ini') || stderr.includes('config')) {
          console.warn(this.mssingConfigWarning());
        }
        
        try {
          if (!stdout.trim()) {
            resolve({});
            return;
          }
          
          const valeOutput = JSON.parse(stdout) as ValeOutput;
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

  private createValeConfigError(stderr: string): Error {
    return new Error(
      `Vale configuration error\n\n` +
      `Vale says:\n  ${stderr.trim()}\n\n` +
      `Fix your .vale.ini and try again.`
    );
  }

  private mssingConfigWarning(): string {
    return (
      `Warning: No .vale.ini found in current directory or parents.\n\n` +
      `Vale will use default configuration. To customize:\n` +
      `  1. Create .vale.ini in your project root\n` +
      `  2. See https://vale.sh/docs/topics/config/\n\n` +
      `Continuing with defaults...`
    );
  }

  private createJsonParseError(rawOutput: string, error: unknown): Error {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return new Error(
      `Failed to parse Vale JSON output\n\n` +
      `Parse error: ${errorMessage}\n\n` +
      `Raw output:\n${rawOutput.substring(0, 500)}${rawOutput.length > 500 ? '...' : ''}`
    );
  }
}
