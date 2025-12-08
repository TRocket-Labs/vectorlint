import { readFileSync } from 'fs';
import * as path from 'path';
import YAML from 'yaml';
import { z } from 'zod';
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

const STYLE_GUIDE_FRONTMATTER_SCHEMA = z.object({
    name: z.string().optional(),
    version: z.string().optional(),
    description: z.string().optional(),
});

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
                    result = this.parseMarkdown(content);
                    break;
                default:
                    throw new ConfigError(
                        `Unsupported format: ${format}`
                    );
            }

            this.validate(result);

            // Auto-categorize rules if not already categorized
            result.rules = result.rules.map((rule) => this.categorizeRule(rule));

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
    parseMarkdown(content: string): ParsedStyleGuide {
        const rules: StyleGuideRule[] = [];
        let name = 'Untitled Style Guide';
        let version: string | undefined;
        let description: string | undefined;

        // Check for YAML frontmatter
        let bodyContent = content;
        if (content.startsWith('---')) {
            const endIndex = content.indexOf('\n---', 3);
            if (endIndex !== -1) {
                const frontmatter = content.slice(3, endIndex).trim();
                bodyContent = content.slice(endIndex + 4);

                try {
                    const raw: unknown = YAML.parse(frontmatter);
                    const parsed = STYLE_GUIDE_FRONTMATTER_SCHEMA.safeParse(raw);

                    if (parsed.success) {
                        const meta = parsed.data;
                        if (meta.name) name = meta.name;
                        if (meta.version) version = meta.version;
                        if (meta.description) description = meta.description;
                    } else {
                        this.warnings.push('Invalid YAML frontmatter format');
                    }
                } catch (e) {
                    this.warnings.push('Failed to parse YAML frontmatter, using defaults');
                }
            }
        }

        // Extract title from first H1 if no name in frontmatter
        const h1Match = bodyContent.match(/^#\s+(.+)$/m);
        if (h1Match && h1Match[1] && name === 'Untitled Style Guide') {
            name = h1Match[1].trim();
        }

        // Parse rules from sections
        const sections = this.extractMarkdownSections(bodyContent);
        let ruleCounter = 0;

        for (const section of sections) {
            // Each H2 or H3 section could be a category
            // If it's H2, it's likely a category header. If H3, it might be a rule.
            let category = 'general';

            // Try to find the parent H2 for this section if possible, 
            // but for now let's just look for category in the current section title if it's H2
            if (section.level === 2) {
                const rawCategory = section.title.replace(/^\d+\.\s*/, '').trim();
                category = this.normalizeCategory(rawCategory);
            }

            // If section is H3, treat the title itself as a rule
            if (section.level === 3) {
                ruleCounter++;
                const ruleId = this.generateRuleId(section.title, ruleCounter);
                rules.push({
                    id: ruleId,
                    category: 'general', // We'd need state to know the parent category, but 'general' is safe for now
                    description: section.title.replace(/^\*\*|\*\*$/g, '').trim(), // Remove bold markers
                    severity: 'warning',
                });
            }

            // Extract rules from list items (bullets and bold lines)
            const listItems = this.extractListItems(section.content);

            for (const item of listItems) {
                ruleCounter++;
                const rule = this.parseMarkdownRule(item, category, ruleCounter);
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
            version,
            description,
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
     * Normalize category name to standard ID format
     */
    private normalizeCategory(raw: string): string {
        return raw.toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/(^-|-$)/g, '');
    }
    private categorizeRule(rule: StyleGuideRule): StyleGuideRule {
        // Keep the category as-is from the markdown section title
        // If no category was set, use 'uncategorized'
        if (!rule.category || rule.category.trim() === '') {
            return { ...rule, category: 'uncategorized' };
        }
        return rule;
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
        category: string,
        index: number
    ): StyleGuideRule | null {
        if (!item.trim()) return null;

        // Generate ID from content
        const id = this.generateRuleId(item, index);

        return {
            id,
            category,
            description: item,
            severity: 'warning', // Default severity
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
