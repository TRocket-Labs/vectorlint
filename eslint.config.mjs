// eslint.config.mjs
import { defineConfig } from "eslint/config";
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import pluginN from "eslint-plugin-n";
import importX from "eslint-plugin-import-x";
import prettier from "eslint-config-prettier/flat";
import globals from "globals";

export default defineConfig([
  // Ignored paths (Flat Config style)
  { ignores: ["node_modules", "coverage", "dist", "build"] },

  // Core JS recommendations
  js.configs.recommended,

  // TypeScript rules (non type-aware, fast)
  ...tseslint.configs.recommended,

  // Node rules
  pluginN.configs["flat/recommended"],

  // Import hygiene and resolution
  importX.flatConfigs.recommended,

  // Project specifics
  {
    files: ["**/*.{ts,tsx,mts,cts,js,mjs,cjs}"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module", // switch to "commonjs" if your CLI is CJS
      globals: { ...globals.node }
    },
    settings: {
      // Make import-x understand TS + Node resolution
      "import-x/resolver": {
        typescript: {
          alwaysTryTypes: true,
          project: "./tsconfig.json"
        },
        node: true
      }
    },
    rules: {
      "no-console": "off"
    }
  },

  // Config files can use dev dependencies
  {
    files: ["*.config.{js,mjs,ts}", "tests/**/*", "**/*.test.{js,ts}"],
    rules: {
      "n/no-unpublished-import": "off"
    }
  },

  // Source files can use specific dev dependencies that are runtime deps
  {
    files: ["src/**/*"],
    rules: {
      "n/no-unpublished-import": ["error", {
        "allowModules": ["fast-glob"]
      }]
    }
  },

  // CLI entry point can use process.exit and any types
  {
    files: ["src/index.ts"],
    rules: {
      "n/no-process-exit": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": "off"
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