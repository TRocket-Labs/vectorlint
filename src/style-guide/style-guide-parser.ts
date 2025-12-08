import { readFileSync } from 'fs';
import * as path from 'path';
import {
    STYLE_GUIDE_SCHEMA,
    type ParsedStyleGuide,
} from '../schemas/style-guide-schemas';
import {
    ValidationError,
    ProcessingError,
    ConfigError,
} from '../errors/index';
import {
    StyleGuideFormat,
    type ParserOptions,
    type ParserResult,
} from './types';

/**
 * Parser for reading style guide documents.
 * Returns raw content - LLM handles extraction and categorization.
 */
export class StyleGuideParser {
    private warnings: string[] = [];

    parse(filePath: string, options: ParserOptions = {}): ParserResult<ParsedStyleGuide> {
        this.warnings = [];

        try {
            const content = readFileSync(filePath, 'utf-8');
            let format = options.format;
            if (!format || format === StyleGuideFormat.AUTO) {
                format = this.detectFormat(filePath);
            }

            // Validate format is supported
            if (format !== StyleGuideFormat.MARKDOWN) {
                throw new ConfigError(`Unsupported format: ${format}`);
            }

            // Extract name from filename
            const name = path.basename(filePath, path.extname(filePath));

            const result: ParsedStyleGuide = {
                name,
                content,
            };

            this.validate(result);

            if (options.verbose && this.warnings.length > 0) {
                console.warn('[StyleGuideParser] Warnings:');
                this.warnings.forEach((w) => console.warn(`  - ${w}`));
            }

            return {
                data: result,
                warnings: this.warnings,
            };
        } catch (error) {
            if (error instanceof ProcessingError || error instanceof ConfigError || error instanceof ValidationError) {
                throw error;
            }
            const err = error instanceof Error ? error : new Error(String(error));
            throw new ProcessingError(
                `Failed to parse style guide: ${err.message}`
            );
        }
    }

    /**
     * Detect format from file extension
     */
    private detectFormat(filePath: string): StyleGuideFormat {
        const ext = path.extname(filePath).toLowerCase();

        switch (ext) {
            case '.md':
            case '.markdown':
                return StyleGuideFormat.MARKDOWN;
            default:
                throw new ConfigError(
                    `Cannot detect format from extension: ${ext}`
                );
        }
    }

    /**
     * Validate parsed style guide against schema
     */
    private validate(styleGuide: ParsedStyleGuide): void {
        try {
            STYLE_GUIDE_SCHEMA.parse(styleGuide);
        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            throw new ValidationError(
                `Style guide validation failed: ${err.message}`
            );
        }
    }
}

