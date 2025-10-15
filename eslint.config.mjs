// eslint.config.mjs
import { defineConfig } from "eslint/config";
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import pluginN from "eslint-plugin-n";
import importX from "eslint-plugin-import-x";
import prettier from "eslint-config-prettier/flat";
import globals from "globals";
import unicorn from "eslint-plugin-unicorn";

export default defineConfig([
    // Ignored + housekeeping
    { ignores: ["node_modules", "coverage", "dist", "build"] },
    { linterOptions: { reportUnusedDisableDirectives: true } },

    // Make resolver settings global
    {
        settings: {
            "import-x/resolver": {
                typescript: { project: "./tsconfig.json", alwaysTryTypes: true },
                node: true
            }
        }
    },

    // Base JS + TS
    js.configs.recommended,
    ...tseslint.configs.recommended,

    // Add typed rules (safer). Requires a tsconfig.
    ...tseslint.configs.recommendedTypeChecked,
    { languageOptions: { parserOptions: { projectService: true } } },

    // Node + Import
    pluginN.configs["flat/recommended"],
    importX.flatConfigs.recommended,

    // Project specifics
    {
        files: ["**/*.{ts,tsx,mts,cts,js,mjs,cjs}"],
        languageOptions: {
            ecmaVersion: 2023,
            sourceType: "module",
            globals: { ...globals.node }
        },
        plugins: { unicorn },
        rules: {
            "no-console": "off",

            // Prefer import-x for resolution; plugin-n can be noisy with TS/ESM
            "n/no-missing-import": "off",

            // Filename case
            "unicorn/filename-case": [
                "error",
                {
                    cases: { kebabCase: true },
                    ignore: [
                        /(^|\/)(README|CHANGELOG|LICENSE)(\..+)?$/i,
                        /(^|\/)\.[^/]+$/,
                        /(^|\/)(eslint|prettier|tsconfig)\.[^/]+$/,
                        /\.d\.ts$/
                    ]
                }
            ],

            // Naming convention
            "@typescript-eslint/naming-convention": [
                "error",
                { selector: "variable", format: ["camelCase", "UPPER_CASE"] },
                { selector: "function", format: ["camelCase"] },
                { selector: "class", format: ["PascalCase"] },
                { selector: "interface", format: ["PascalCase"] },
                { selector: "typeAlias", format: ["PascalCase"] },
                { selector: "enum", format: ["PascalCase"] },
                { selector: "variable", modifiers: ["const", "global"], format: ["UPPER_CASE"] },
                { selector: "variable", modifiers: ["destructured"], format: null }
            ]
        }
    },

    // Configs & tests can import dev deps
    {
        files: ["*.config.{js,mjs,ts}", "tests/**/*", "**/*.test.{js,ts}"],
        rules: { "n/no-unpublished-import": "off" }
    },

    // Runtime sources must not import dev deps
    {
        files: ["src/**/*"],
        rules: {
            // Remove the allowlist; keep runtime deps in "dependencies"
            "n/no-unpublished-import": "error"
        }
    },

    // CLI entry point can use process.exit and any types
    {
        files: ["src/index.ts"],
        rules: {
            "n/no-process-exit": "off",
            "@typescript-eslint/no-explicit-any": "off",
            // Use underscore pattern for intentional unused vars
            "@typescript-eslint/no-unused-vars": ["error", { "argsIgnorePattern": "^_" }]
        }
    },

    // YAML parsing files and providers can use any types
    {
        files: ["src/prompts/PromptLoader.ts", "src/prompts/PromptValidator.ts", "src/providers/*.ts"],
        rules: {
            "@typescript-eslint/no-explicit-any": "off"
        }
    },

    // CommonJS override for .cjs / .cts files
    {
        files: ["**/*.{cjs,cts}"],
        languageOptions: {
            sourceType: "commonjs"
        }
    },

    // Keep Prettier in charge of formatting
    prettier
]);