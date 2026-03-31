import { OutputFormat, type EvaluationOptions, type EvaluationResult } from '../cli/types';
import { runAgentExecutor, type RunAgentExecutorParams } from './agent-executor';
import { buildAgentReplayReport } from './session-replay';
import { createAgentProgressReporter } from '../output/agent-progress-reporter';

export async function runAgentModeEvaluation(
  targets: string[],
  options: EvaluationOptions
): Promise<EvaluationResult> {
  if (targets.length === 0) {
    return {
      totalFiles: 0,
      totalErrors: 0,
      totalWarnings: 0,
      requestFailures: 0,
      hadOperationalErrors: false,
      hadSeverityErrors: false,
      tokenUsage: {
        totalInputTokens: 0,
        totalOutputTokens: 0,
      },
    };
  }

  const runResult = await runAgentExecutor({
    targets,
    prompts: options.prompts,
    ...(options.outputFormat === OutputFormat.Line &&
    !options.print &&
    process.stderr.isTTY
      ? {
        progressReporter: createAgentProgressReporter({
          write: (text: string) => {
            process.stderr.write(text);
          },
        }),
      }
      : {}),
    ...(options.agent?.homeDir ? { homeDir: options.agent.homeDir } : {}),
    ...(options.agent?.runRule
      ? { runRule: options.agent.runRule as RunAgentExecutorParams['runRule'] }
      : {}),
    ...(options.agent?.execute
      ? { executeAgent: options.agent.execute as RunAgentExecutorParams['executeAgent'] }
      : {}),
  });
  const replayReport = await buildAgentReplayReport(runResult.sessionFilePath);

  return {
    totalFiles: targets.length,
    totalErrors: replayReport.summary.errors,
    totalWarnings: replayReport.summary.warnings,
    requestFailures: 0,
    hadOperationalErrors: Boolean(runResult.error),
    hadSeverityErrors: false,
    tokenUsage: {
      totalInputTokens: 0,
      totalOutputTokens: 0,
    },
    agentReport: replayReport,
  };
}

export * from './agent-executor';
export * from './review-session-store';
export * from './session-replay';
export * from './types';
