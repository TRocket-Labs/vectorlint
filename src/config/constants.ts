import pkg from '../../package.json';
import { PACKAGE_JSON_SCHEMA } from '../schemas';

/**
 * Configuration constants
 */


export const CLI_VERSION = PACKAGE_JSON_SCHEMA.parse(pkg).version;

export const LEGACY_CONFIG_FILENAME = 'vectorlint.ini';
export const DEFAULT_CONFIG_FILENAME = '.vectorlint.ini';
export const GLOBAL_CONFIG_DIR = '.vectorlint';
export const GLOBAL_CONFIG_FILE = 'config.toml';
export const STYLE_GUIDE_FILENAME = 'VECTORLINT.md';
export const STYLE_GUIDE_TOKEN_WARNING_THRESHOLD = 4000;
export const ALLOWED_EXTS = new Set(['.md', '.txt', '.mdx']);

export const CLI_DESCRIPTION = `VectorLint is a command-line tool that evaluates and scores content using LLMs. It uses LLM-as-a-Judge to catch terminology, technical accuracy, and style issues that require contextual understanding.

To get started, run 'vectorlint init' to create your configuration files.

Then, set up your API key:

  Example (~/${GLOBAL_CONFIG_DIR}/${GLOBAL_CONFIG_FILE}):

      [api]
      key = "your-api-key"

See https://github.com/TRocket-Labs/vectorlint for more setup information.`;
