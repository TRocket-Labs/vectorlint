import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Command } from 'commander';
import { createMockLogger } from './utils';
import { NoopObservability } from '../src/observability/noop-observability';

const MOCK_PARSE_CLI_OPTIONS = vi.hoisted(() => vi.fn());
const MOCK_PARSE_ENVIRONMENT = vi.hoisted(() => vi.fn());
const MOCK_LOAD_DIRECTIVE = vi.hoisted(() => vi.fn());
const MOCK_LOAD_USER_INSTRUCTIONS = vi.hoisted(() => vi.fn());
const MOCK_CREATE_WINSTON_LOGGER = vi.hoisted(() => vi.fn());
const MOCK_LOAD_CONFIG = vi.hoisted(() => vi.fn());
const MOCK_RESOLVE_TARGETS = vi.hoisted(() => vi.fn());
const MOCK_CREATE_OBSERVABILITY = vi.hoisted(() => vi.fn());
const MOCK_CREATE_PROVIDER = vi.hoisted(() => vi.fn());
const MOCK_EVALUATE_FILES = vi.hoisted(() => vi.fn());
const MOCK_LOAD_RULE_FILE = vi.hoisted(() => vi.fn());
const MOCK_LIST_ALL_PACKS = vi.hoisted(() => vi.fn());
const MOCK_FIND_RULE_FILES = vi.hoisted(() => vi.fn());

vi.mock('../src/boundaries/index', () => ({
  parseCliOptions: MOCK_PARSE_CLI_OPTIONS,
  parseEnvironment: MOCK_PARSE_ENVIRONMENT,
}));

vi.mock('../src/prompts/directive-loader', () => ({
  loadDirective: MOCK_LOAD_DIRECTIVE,
}));

vi.mock('../src/boundaries/user-instruction-loader', () => ({
  loadUserInstructions: MOCK_LOAD_USER_INSTRUCTIONS,
}));

vi.mock('../src/logging/winston-logger', () => ({
  createWinstonLogger: MOCK_CREATE_WINSTON_LOGGER,
}));

vi.mock('../src/boundaries/config-loader', () => ({
  loadConfig: MOCK_LOAD_CONFIG,
}));

vi.mock('../src/scan/file-resolver', () => ({
  resolveTargets: MOCK_RESOLVE_TARGETS,
}));

vi.mock('../src/observability/factory', () => ({
  createObservability: MOCK_CREATE_OBSERVABILITY,
}));

vi.mock('../src/providers/provider-factory', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/providers/provider-factory')>();
  return {
    ...actual,
    createProvider: MOCK_CREATE_PROVIDER,
  };
});

vi.mock('../src/cli/orchestrator', () => ({
  evaluateFiles: MOCK_EVALUATE_FILES,
}));

vi.mock('../src/prompts/prompt-loader', () => ({
  loadRuleFile: MOCK_LOAD_RULE_FILE,
}));

vi.mock('../src/config/preset-loader', () => ({
  PresetLoader: class PresetLoader {},
}));

vi.mock('../src/boundaries/rule-pack-loader', () => ({
  RulePackLoader: class RulePackLoader {
    listAllPacks() {
      return Promise.resolve(MOCK_LIST_ALL_PACKS());
    }

    findRuleFiles() {
      return Promise.resolve(MOCK_FIND_RULE_FILES());
    }
  },
}));

describe('Main command observability lifecycle', () => {
  const env = {
    LLM_PROVIDER: 'openai',
    OPENAI_API_KEY: 'sk-test',
    OPENAI_MODEL: 'gpt-4o',
  };

  let exitSpy: ReturnType<typeof vi.spyOn>;
  const runtimeLogger = createMockLogger();

  beforeEach(() => {
    vi.clearAllMocks();

    MOCK_PARSE_CLI_OPTIONS.mockResolvedValue({
      verbose: false,
      showPrompt: false,
      showPromptTrunc: false,
      debugJson: false,
      output: 'line',
      mode: 'standard',
      print: false,
      config: undefined,
    });
    MOCK_PARSE_ENVIRONMENT.mockReturnValue(env);
    MOCK_LOAD_DIRECTIVE.mockResolvedValue('');
    MOCK_LOAD_USER_INSTRUCTIONS.mockReturnValue({ content: '', tokenEstimate: 0 });
    MOCK_CREATE_WINSTON_LOGGER.mockReturnValue(runtimeLogger);
    MOCK_LOAD_CONFIG.mockResolvedValue({
      rulesPath: undefined,
      concurrency: 1,
      scanPaths: [],
      configDir: process.cwd(),
    });
    MOCK_LIST_ALL_PACKS.mockResolvedValue([]);
    MOCK_FIND_RULE_FILES.mockResolvedValue([]);
    MOCK_LOAD_RULE_FILE.mockReturnValue({ prompt: undefined, warning: undefined });
    MOCK_RESOLVE_TARGETS.mockReturnValue(['README.md']);
    MOCK_CREATE_PROVIDER.mockReturnValue({ mocked: true });
    MOCK_EVALUATE_FILES.mockResolvedValue({
      totalFiles: 1,
      totalErrors: 0,
      totalWarnings: 0,
      requestFailures: 0,
      hadOperationalErrors: false,
      hadSeverityErrors: false,
      tokenUsage: undefined,
    });

    exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: string | number | null) => {
      throw new Error(`process.exit:${code ?? ''}`);
    }) as never);
  });

  afterEach(() => {
    exitSpy.mockRestore();
  });

  it('initializes observability before creating the provider and shuts it down before exit', async () => {
    const observability = {
      init: vi.fn().mockResolvedValue(undefined),
      decorateCall: vi.fn(() => ({})),
      shutdown: vi.fn().mockResolvedValue(undefined),
    };
    MOCK_CREATE_OBSERVABILITY.mockReturnValue(observability);

    const { registerMainCommand } = await import('../src/cli/commands');
    const program = new Command();
    registerMainCommand(program);

    await expect(program.parseAsync(['node', 'test', 'README.md'])).rejects.toThrow('process.exit:0');

    expect(MOCK_CREATE_OBSERVABILITY).toHaveBeenCalledWith(env, runtimeLogger);
    expect(observability.init).toHaveBeenCalledTimes(1);
    expect(MOCK_CREATE_PROVIDER).toHaveBeenCalledWith(
      env,
      expect.objectContaining({
        logger: runtimeLogger,
        observability,
      }),
      expect.anything()
    );
    expect(observability.init.mock.invocationCallOrder[0]).toBeLessThan(MOCK_CREATE_PROVIDER.mock.invocationCallOrder[0]);
    expect(observability.shutdown).toHaveBeenCalledTimes(1);
    expect(observability.shutdown.mock.invocationCallOrder[0]).toBeLessThan(exitSpy.mock.invocationCallOrder[0]);
  });

  it('falls back to noop observability when initialization fails', async () => {
    const failingObservability = {
      init: vi.fn().mockRejectedValue(new Error('boom')),
      decorateCall: vi.fn(() => ({})),
      shutdown: vi.fn().mockResolvedValue(undefined),
    };
    MOCK_CREATE_OBSERVABILITY.mockReturnValue(failingObservability);

    const { registerMainCommand } = await import('../src/cli/commands');
    const program = new Command();
    registerMainCommand(program);

    await expect(program.parseAsync(['node', 'test', 'README.md'])).rejects.toThrow('process.exit:0');

    expect(runtimeLogger.warn).toHaveBeenCalledWith(
      '[vectorlint] Observability initialization failed; continuing without telemetry',
      expect.objectContaining({
        error: 'boom',
      })
    );

    const providerOptions = MOCK_CREATE_PROVIDER.mock.calls.at(-1)?.[1] as { observability?: unknown };
    expect(providerOptions.observability).toBeInstanceOf(NoopObservability);
  });
});
