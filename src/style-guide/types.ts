import { LLMProvider } from "../providers";

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

export interface RuleGenerationOptions {
    llmProvider: LLMProvider;
    templateDir?: string | undefined;
    defaultSeverity?: 'error' | 'warning' | undefined;
    strictness?: 'lenient' | 'standard' | 'strict' | undefined;
}

export interface GeneratedRule {
    filename: string;
    content: string;
    meta: {
        id: string;
        name: string;
        severity: string;
        type: string;
    };
}
