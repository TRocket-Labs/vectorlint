/**
 * Base error for style guide operations
 */
export class StyleGuideError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'StyleGuideError';
    }
}

/**
 * Error thrown when parsing style guide fails
 */
export class StyleGuideParseError extends StyleGuideError {
    constructor(
        message: string,
        public filePath?: string,
        public line?: number
    ) {
        super(message);
        this.name = 'StyleGuideParseError';
    }
}

/**
 * Error thrown when style guide validation fails
 */
export class StyleGuideValidationError extends StyleGuideError {
    constructor(
        message: string,
        public issues?: string[]
    ) {
        super(message);
        this.name = 'StyleGuideValidationError';
    }
}

/**
 * Error thrown when eval generation fails
 */
export class EvalGenerationError extends StyleGuideError {
    constructor(
        message: string,
        public ruleId?: string
    ) {
        super(message);
        this.name = 'EvalGenerationError';
    }
}

/**
 * Error thrown when unsupported format is encountered
 */
export class UnsupportedFormatError extends StyleGuideError {
    constructor(
        message: string,
        public format?: string
    ) {
        super(message);
        this.name = 'UnsupportedFormatError';
    }
}
