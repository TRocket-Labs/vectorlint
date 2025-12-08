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

export type ResolvedProcessorOptions = {
    maxCategories: number;
    verbose: boolean;
    defaultSeverity: 'error' | 'warning';
    strictness: 'lenient' | 'standard' | 'strict';
    filterRule?: string | undefined;
    templateDir?: string | undefined;
};

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

export interface TemplateContext {
    EVALUATION_TYPE: string;
    RULE_ID: string;
    RULE_NAME: string;
    SEVERITY: string;
    PROMPT_BODY: string;
    CRITERIA?: Array<{
        name: string;
        id: string;
        weight: number;
    }> | undefined;
    RUBRIC?: string | undefined;
    [key: string]: unknown;
}
