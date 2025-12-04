export enum StyleGuideFormat {
    MARKDOWN = 'markdown',
    AUTO = 'auto',
}

export enum RuleCategory {
    GRAMMAR = 'grammar',
    TONE = 'tone',
    TERMINOLOGY = 'terminology',
    STRUCTURE = 'structure',
    FORMATTING = 'formatting',
    ACCESSIBILITY = 'accessibility',
    SEO = 'seo',
    CUSTOM = 'custom',
}

export interface ParserOptions {
    format?: StyleGuideFormat;
    verbose?: boolean;
    strict?: boolean;
}

export interface ParserResult<T> {
    data: T;
    warnings: string[];
}
