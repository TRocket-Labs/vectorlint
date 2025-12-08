export enum StyleGuideFormat {
    MARKDOWN = 'markdown',
    AUTO = 'auto',
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
