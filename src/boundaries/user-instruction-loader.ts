import { existsSync, readFileSync } from 'fs';
import * as path from 'path';
import { USER_INSTRUCTION_FILENAME, USER_INSTRUCTION_TOKEN_WARNING_THRESHOLD } from '../config/constants';

export interface UserInstructionResult {
    content: string | null;
    tokenEstimate: number;
    path: string | null;
}

/**
 * Estimates token count for a given text string.
 * Uses a rough approximation of 4 characters per token.
 */
export function estimateTokens(text: string): number {
    return Math.ceil((text?.length ?? 0) / 4);
}

/**
 * Loads the VECTORLINT.md user instructions from the specified directory.
 * Checks for the file, reads it, estimates tokens, and warns if it exceeds the threshold.
 */
export function loadUserInstructions(cwd: string): UserInstructionResult {
    const userInstructionPath = path.resolve(cwd, USER_INSTRUCTION_FILENAME);

    if (!existsSync(userInstructionPath)) {
        return {
            content: null,
            tokenEstimate: 0,
            path: null
        };
    }

    try {
        const content = readFileSync(userInstructionPath, 'utf-8');
        const tokenEstimate = estimateTokens(content);

        if (tokenEstimate > USER_INSTRUCTION_TOKEN_WARNING_THRESHOLD) {
            console.warn(
                `[vectorlint] Warning: ${USER_INSTRUCTION_FILENAME} is approximately ${tokenEstimate} tokens, ` +
                `which exceeds the recommended limit of ${USER_INSTRUCTION_TOKEN_WARNING_THRESHOLD}. ` +
                `This may impact performance and costs.`
            );
        }

        return {
            content,
            tokenEstimate,
            path: userInstructionPath
        };
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`[vectorlint] Failed to read ${USER_INSTRUCTION_FILENAME}: ${message}`);

        return {
            content: null,
            tokenEstimate: 0,
            path: userInstructionPath // Return path even on error so caller knows it existed
        };
    }
}
