import { readFileSync } from 'fs';
import * as path from 'path';
import {
    STYLE_GUIDE_SCHEMA,
    type ParsedStyleGuide,
    type StyleGuideRule,
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
 * Parser for converting style guide documents into structured format
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

            let result: ParsedStyleGuide;

            switch (format) {
                case StyleGuideFormat.MARKDOWN:
                    result = this.parseMarkdown(content, filePath);
                    break;
                default:
                    throw new ConfigError(
                        `Unsupported format: ${format}`
                    );
            }

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
     * Parse Markdown format style guide
     */
    parseMarkdown(content: string, filePath: string): ParsedStyleGuide {
        const rules: StyleGuideRule[] = [];
        // Name from filename (without extension)
        const name = path.basename(filePath, path.extname(filePath));

        // Parse rules from sections
        const sections = this.extractMarkdownSections(content);
        let ruleCounter = 0;

        for (const section of sections) {
            // If section is H3, treat the title itself as a rule
            if (section.level === 3) {
                ruleCounter++;
                const ruleId = this.generateRuleId(section.title, ruleCounter);
                rules.push({
                    id: ruleId,
                    description: section.title.replace(/^\*\*|\*\*$/g, '').trim(),
                    severity: 'warning',
                });
            }

            // Extract rules from list items (bullets and bold lines)
            const listItems = this.extractListItems(section.content);

            for (const item of listItems) {
                ruleCounter++;
                const rule = this.parseMarkdownRule(item, ruleCounter);
                if (rule) {
                    rules.push(rule);
                }
            }
        }

        if (rules.length === 0) {
            this.warnings.push('No rules found in style guide');
        }

        return {
            name,
            rules,
        };
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


    /**
     * Extract sections from markdown content
     */
    private extractMarkdownSections(content: string): Array<{ level: number; title: string; content: string }> {
        const sections: Array<{ level: number; title: string; content: string }> = [];
        const lines = content.split(/\r?\n/);
        let currentSection: { level: number; title: string; content: string } | null = null;

        for (const line of lines) {
            const headingMatch = line.match(/^(#{2,3})\s+(.+)$/);

            if (headingMatch && headingMatch[1] && headingMatch[2]) {
                if (currentSection) {
                    sections.push(currentSection);
                }
                currentSection = {
                    level: headingMatch[1].length,
                    title: headingMatch[2].trim(),
                    content: line + '\n',
                };
            } else if (currentSection) {
                currentSection.content += line + '\n';
            }
        }

        if (currentSection) {
            sections.push(currentSection);
        }

        return sections;
    }

    /**
     * Extract list items from markdown content
     */
    private extractListItems(content: string): string[] {
        const items: string[] = [];
        const lines = content.split(/\r?\n/);
        let currentItem = '';

        for (const line of lines) {
            // Match list items starting with - or *
            const listMatch = line.match(/^\s*[-*]\s+(.+)$/);
            // Match lines starting with bold text: **Rule**
            const boldMatch = line.match(/^\s*\*\*(.+?)\*\*(.*)$/);

            if (listMatch) {
                if (currentItem) {
                    items.push(currentItem.trim());
                }
                currentItem = listMatch[1]!;
            } else if (boldMatch) {
                if (currentItem) {
                    items.push(currentItem.trim());
                }
                // For bold rules, we take the whole line usually, or just the bold part?
                // User example: "**Write in Second Person...** Address your readers..."
                // Let's take the bold part + the rest of the line
                currentItem = boldMatch[1]! + boldMatch[2];
            } else if (currentItem && line.trim()) {
                // Continuation of previous item
                currentItem += ' ' + line.trim();
            }
        }

        if (currentItem) {
            items.push(currentItem.trim());
        }

        return items;
    }

    /**
     * Parse a single markdown rule from list item
     */
    private parseMarkdownRule(
        item: string,
        index: number
    ): StyleGuideRule | null {
        if (!item.trim()) return null;

        // Generate ID from content
        const id = this.generateRuleId(item, index);

        return {
            id,
            description: item,
            severity: 'warning',
        };
    }

    /**
     * Generate a rule ID from description
     */
    private generateRuleId(description: string, index: number): string {
        // Create slug from first few words
        const words = description
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, '')
            .split(/\s+/)
            .slice(0, 4)
            .join('-');

        return `rule-${words || index}`;
    }
}
