
export interface FilePatternConfig {
    pattern: string;
    runRules?: string[] | undefined; // List of pack names to run (optional)
    overrides: Record<string, string | number | boolean>;
}

export class FileSectionParser {
    /**
     * Parses the raw configuration object to extract file sections.
     * File sections are keys that look like glob patterns.
     * @param rawConfig The raw configuration object parsed from INI/JSON
     * @returns A list of parsed file pattern configurations
     */
    parseSections(rawConfig: Record<string, unknown>): FilePatternConfig[] {
        const sections: FilePatternConfig[] = [];

        for (const [key, value] of Object.entries(rawConfig)) {
            if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
                const pattern = key;
                const sectionConfig = value as Record<string, unknown>;

                const runRulesRaw = sectionConfig['RunRules'];
                let runRules: string[] | undefined;

                if (typeof runRulesRaw === 'string') {
                    const strValue = runRulesRaw;
                    if (strValue.trim() === '') {
                        runRules = [];
                    } else {
                        runRules = strValue.split(',').map(s => s.trim()).filter(s => s.length > 0);
                    }
                }

                const overrides: Record<string, string | number | boolean> = {};
                for (const [propKey, propValue] of Object.entries(sectionConfig)) {
                    if (propKey !== 'RunRules') {
                        // INI values are strings, but may be parsed as numbers/booleans
                        if (typeof propValue === 'string' || typeof propValue === 'number' || typeof propValue === 'boolean') {
                            overrides[propKey] = propValue;
                        }
                    }
                }

                const section: FilePatternConfig = {
                    pattern,
                    overrides
                };

                if (runRules !== undefined) {
                    section.runRules = runRules;
                }

                sections.push(section);
            }
        }

        return sections;
    }
}
