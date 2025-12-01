
export interface FilePatternConfig {
    pattern: string;
    runEvals: string[]; // List of pack names to run
    overrides: Record<string, any>;
}

export class FileSectionParser {
    /**
     * Parses the raw configuration object to extract file sections.
     * File sections are keys that look like glob patterns.
     * @param rawConfig The raw configuration object parsed from INI/JSON
     * @returns A list of parsed file pattern configurations
     */
    parseSections(rawConfig: Record<string, any>): FilePatternConfig[] {
        const sections: FilePatternConfig[] = [];

        for (const [key, value] of Object.entries(rawConfig)) {
            if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
                const pattern = key;
                const sectionConfig = value as Record<string, any>;

                const runEvalsRaw = sectionConfig['RunEvals'];
                let runEvals: string[] = [];

                if (typeof runEvalsRaw === 'string') {
                    if (runEvalsRaw.trim() === '') {
                        runEvals = [];
                    } else {
                        runEvals = runEvalsRaw.split(',').map(s => s.trim()).filter(s => s.length > 0);
                    }
                }

                const overrides: Record<string, any> = {};
                for (const [propKey, propValue] of Object.entries(sectionConfig)) {
                    if (propKey !== 'RunEvals') {
                        overrides[propKey] = propValue;
                    }
                }

                sections.push({
                    pattern,
                    runEvals,
                    overrides
                });
            }
        }

        return sections;
    }
}
