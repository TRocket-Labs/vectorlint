import * as fs from 'fs/promises';
import * as path from 'path';

export class EvalPackLoader {
    /**
     * Finds all available eval packs (subdirectories) in the prompts path.
     * @param promptsPath The root prompts directory
     * @returns A list of pack names (subdirectory names)
     */
    async findAllPacks(promptsPath: string): Promise<string[]> {
        try {
            await fs.access(promptsPath);
        } catch {
            throw new Error(`Prompts path not accessible: ${promptsPath}`);
        }

        const entries = await fs.readdir(promptsPath, { withFileTypes: true });
        return entries
            .filter(entry => entry.isDirectory())
            .map(entry => entry.name);
    }

    /**
     * Recursively finds all evaluation files in a pack directory.
     * @param packRoot The root directory of the eval pack (e.g., PromptsPath/VectorLint)
     * @returns A list of absolute file paths to evaluation files
     */
    async findEvalFiles(packRoot: string): Promise<string[]> {
        const evalFilePaths: string[] = [];

        try {
            await fs.access(packRoot);
        } catch {
            throw new Error(`Pack directory not accessible: ${packRoot}`);
        }

        async function traverse(currentDir: string) {
            const entries = await fs.readdir(currentDir, { withFileTypes: true });

            for (const entry of entries) {
                const fullPath = path.join(currentDir, entry.name);

                if (entry.isDirectory()) {
                    await traverse(fullPath);
                } else if (entry.isFile() && entry.name.endsWith('.md')) {
                    evalFilePaths.push(fullPath);
                }
            }
        }

        await traverse(packRoot);
        return evalFilePaths;
    }
}
