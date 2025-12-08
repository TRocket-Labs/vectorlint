import { LLMProvider } from "../providers";

export interface StyleGuideProcessorOptions {
    llmProvider: LLMProvider;
    maxCategories?: number | undefined;
    filterRule?: string | undefined;
    templateDir?: string | undefined;
    defaultSeverity?: 'error' | 'warning' | undefined;
    strictness?: 'lenient' | 'standard' | 'strict' | undefined;
    verbose?: boolean | undefined;
}

export interface GeneratedCategoryRule {
    filename: string;
    content: string;
    meta: {
        id: string;
        name: string;
        categoryType: string;
        ruleCount: number;
    };
}

