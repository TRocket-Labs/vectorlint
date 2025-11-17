import { readFileSync } from 'fs';
import * as path from 'path';
import type { PromptFile } from '../prompts/prompt-loader';
import type { LLMProvider } from '../providers/llm-provider';
import type { SearchProvider } from '../providers/search-provider';
import type { PromptMapping } from '../prompts/prompt-mapping';
import { printFileHeader, printIssueRow, printPromptOverallLine, printCriterionScoreLines } from '../output/reporter';
import { locateEvidence } from '../output/location';
import { checkTarget } from '../prompts/target';
import { resolvePromptMapping, aliasForPromptPath, isMappingConfigured } from '../prompts/prompt-mapping';
import { handleUnknownError } from '../errors/index';
import { createEvaluator } from '../evaluators/evaluator-registry';

export interface EvaluationOptions {
  prompts: PromptFile[];
  promptsPath: string;
  provider: LLMProvider;
  searchProvider?: SearchProvider;
  concurrency: number;
  verbose: boolean;
  mapping?: PromptMapping;
}

export interface EvaluationResult {
  totalFiles: number;
  totalErrors: number;
  totalWarnings: number;
  requestFailures: number;
  hadOperationalErrors: boolean;
  hadSeverityErrors: boolean;
}

/*
 * Generic concurrency runner that executes workers in parallel up to a specified limit.
 * Preserves result order matching input order.
 */
async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array<R>(items.length);
  let i = 0;
  const workers = new Array(Math.min(limit, items.length)).fill(0).map(async () => {
    while (true) {
      const idx = i++;
      if (idx >= items.length) break;
      const item = items[idx];
      if (item !== undefined) {
        results[idx] = await worker(item, idx);
      }
    }
  });
  await Promise.all(workers);
  return results;
}

/*
 * Runs evaluations across all target files with configurable concurrency.
 * Coordinates prompt-to-file mapping, evaluation execution, and result aggregation.
 * Returns aggregated results for reporting.
 */
export async function evaluateFiles(
  targets: string[],
  options: EvaluationOptions
): Promise<EvaluationResult> {
  const { prompts, promptsPath, provider, searchProvider, concurrency, mapping } = options;
  
  let hadOperationalErrors = false;
  let hadSeverityErrors = false;
  let totalFiles = 0;
  let totalErrors = 0;
  let totalWarnings = 0;
  let requestFailures = 0;

  for (const file of targets) {
    try {
      const content = readFileSync(file, 'utf-8');
      totalFiles += 1;
      const relFile = path.relative(process.cwd(), file) || file;
      printFileHeader(relFile);

      // Determine applicable prompts for this file using mapping
      const toRun: PromptFile[] = (() => {
        if (!mapping || !isMappingConfigured(mapping)) return prompts;
        return prompts.filter((p) => {
          const promptId = String(p.meta.id || p.id);
          const full = p.fullPath || path.resolve(promptsPath, p.filename);
          const alias = aliasForPromptPath(full, mapping, process.cwd());
          return resolvePromptMapping(relFile, promptId, mapping, alias);
        });
      })();

      // Run applicable prompts concurrently
      const results = await runWithConcurrency(toRun, concurrency, async (p) => {
        try {
          const meta = p.meta;
          if (!meta || !Array.isArray(meta.criteria) || meta.criteria.length === 0) {
            throw new Error(`Prompt ${p.filename} has no criteria in frontmatter`);
          }
          
          const evaluatorType = meta.evaluator || 'base-llm';
          const evaluator = createEvaluator(evaluatorType, provider, p, searchProvider);
          const result = await evaluator.evaluate(relFile, content);
          
          return { ok: true as const, result };
        } catch (e: unknown) {
          const err = handleUnknownError(e, `Running prompt ${p.filename}`);
          return { ok: false as const, error: err };
        }
      });

      // Process results for each prompt
      for (let idx = 0; idx < toRun.length; idx++) {
        const p = toRun[idx];
        const r = results[idx];
        if (!p || !r) continue;
        
        if (r.ok !== true) {
          console.error(`  Prompt failed: ${p.filename}`);
          console.error(r.error);
          hadOperationalErrors = true;
          requestFailures += 1;
          continue;
        }
        
        const meta = p.meta;
        const promptId = (meta.id || '').toString();
        const result = r.result;
        
        // Validate criterion completeness
        const expectedNames = new Set<string>(meta.criteria.map((c) => String(c.name)));
        const returnedNames = new Set(result.criteria.map((c: { name: string }) => c.name));
        for (const name of expectedNames) {
          if (!returnedNames.has(name)) {
            console.error(`Missing criterion in model output: ${name}`);
            hadOperationalErrors = true;
          }
        }
        for (const name of returnedNames) {
          if (!expectedNames.has(name)) {
            console.warn(`[vectorlint] Extra criterion returned by model (ignored): ${name}`);
          }
        }
        
        let promptErrors = 0;
        let promptWarnings = 0;
        let promptUserScore = 0;
        let promptMaxScore = 0;
        const criterionScores: Array<{ id: string; scoreText: string }> = [];
        
        // Validate scores
        for (const exp of meta.criteria) {
          const nameKey = String(exp.name);
          const got = result.criteria.find(c => c.name === nameKey);
          if (!got) continue;
          const score = Number(got.score);
          if (!Number.isFinite(score) || score < 0 || score > 4) {
            console.error(`Invalid score for ${exp.name}: ${score}`);
            hadOperationalErrors = true;
          }
        }
        
        // Process each criterion
        for (const exp of meta.criteria) {
          const nameKey = String(exp.name);
          const criterionId = (exp.id ? String(exp.id) : (exp.name ? String(exp.name).replace(/[^A-Za-z0-9]+/g, ' ').split(' ').filter(Boolean).map(s => s.charAt(0).toUpperCase() + s.slice(1)).join('') : ''));
          const ruleName = promptId && criterionId ? `${promptId}.${criterionId}` : (promptId || criterionId || p.filename);
          
          // Target gating (deterministic precheck)
          const targetCheck = checkTarget(content, meta.target, exp.target);
          const missingTarget = targetCheck.missing;

          // Always add to max score using weight
          const weightNum = exp.weight;
          promptMaxScore += weightNum;

          if (missingTarget) {
            const status: 'ok' | 'warning' | 'error' = 'error';
            hadSeverityErrors = true;
            promptErrors += 1;
            const summary = 'target not found';
            const suggestion = (targetCheck.suggestion || exp.target?.suggestion || meta.target?.suggestion || 'Add the required target section.');
            const locStr = '1:1';
            printIssueRow(locStr, status, summary, ruleName, { suggestion });
            criterionScores.push({ id: ruleName, scoreText: 'nil' });
            continue;
          }

          const got = result.criteria.find(c => c.name === nameKey);
          if (!got) continue;
          
          const score = Number(got.score);
          const status: 'ok' | 'warning' | 'error' = score <= 1 ? 'error' : (score === 2 ? 'warning' : 'ok');
          if (status === 'error') {
            hadSeverityErrors = true;
            promptErrors += 1;
          } else if (status === 'warning') {
            promptWarnings += 1;
          }
          
          const violations = got.violations;

          // Calculate weighted score
          const w = weightNum;
          const rawWeighted = (score / 4) * w;
          promptUserScore += rawWeighted;
          const rounded = Math.round(rawWeighted * 100) / 100;
          const weightedStr = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
          const scoreText = `${weightedStr}/${w}`;

          if (violations.length === 0) {
            // Print positive remark when no findings are reported
            const sum = got.summary.trim();
            const words = sum.split(/\s+/).filter(Boolean);
            const limited = words.slice(0, 15).join(' ');
            const summaryText = limited || 'No findings';
            printIssueRow('—:—', status, summaryText, ruleName, {});
          } else {
            /*
             * Print one row per violation.
             * Note: If using technical-accuracy evaluator, the analysis field
             * will already contain verification results (status, justification, link).
             */
            for (let i = 0; i < violations.length; i++) {
              const v = violations[i];
              if (!v) continue;
              
              let locStr = '—:—';
              try {
                const loc = locateEvidence(content, { pre: v.pre, post: v.post });
                if (loc) locStr = `${loc.line}:${loc.column}`;
                else { hadOperationalErrors = true; }
              } catch (e: unknown) {
                const err = handleUnknownError(e, 'Locating evidence');
                console.warn(`[vectorlint] Warning: ${err.message}`);
                hadOperationalErrors = true;
              }

              const rowSummary = (v.analysis || '').trim();
              printIssueRow(locStr, status, rowSummary, ruleName, {});
            }
          }
          
          // Record score for summary list
          criterionScores.push({ id: ruleName, scoreText });
        }
        
        // Print per-criterion scores and overall threshold check
        printCriterionScoreLines(criterionScores);
        const thresholdOverall = meta.threshold !== undefined ? Number(meta.threshold) : undefined;
        printPromptOverallLine(promptMaxScore, thresholdOverall, promptUserScore);
        console.log('');
        
        if (thresholdOverall !== undefined && promptUserScore < thresholdOverall) {
          const sev = meta.severity || 'error';
          if (sev === 'error') hadSeverityErrors = true;
          else totalWarnings += 1;
        }

        totalErrors += promptErrors;
        totalWarnings += promptWarnings;
      }
      
      console.log('');
    } catch (e: unknown) {
      const err = handleUnknownError(e, `Processing file ${file}`);
      console.error(`Error processing file ${file}: ${err.message}`);
      hadOperationalErrors = true;
    }
  }

  return {
    totalFiles,
    totalErrors,
    totalWarnings,
    requestFailures,
    hadOperationalErrors,
    hadSeverityErrors,
  };
}
