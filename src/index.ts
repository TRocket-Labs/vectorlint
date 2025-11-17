#!/usr/bin/env node
import { program } from 'commander';
import { readFileSync, existsSync } from 'fs';
import * as path from 'path';
import { handleUnknownError } from './errors/index';
import { registerValidateCommand } from './cli/validate-command';
import { registerMainCommand } from './cli/commands';
import { registerValeAICommand } from './cli/vale-ai-command';

// Import evaluators to trigger self-registration
import './evaluators/base-llm-evaluator';
import './evaluators/technical-accuracy-evaluator';

/*
 * Best-effort .env loader without external dependencies.
 * Loads environment variables from .env or .env.local files.
 * Kept inline to avoid external dependencies and maintain simplicity.
 */
function loadDotEnv(): void {
  const candidates = ['.env', '.env.local'];
  for (const filename of candidates) {
    const full = path.resolve(process.cwd(), filename);
    if (!existsSync(full)) continue;
    try {
      const content = readFileSync(full, 'utf-8');
      for (const rawLine of content.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) continue;
        const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
        if (!match || !match[1] || !match[2]) continue;
        const key = match[1];
        let value = match[2];
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        } else {
          const hashAt = value.indexOf(' #');
          if (hashAt !== -1) value = value.slice(0, hashAt).trim();
        }
        if (process.env[key] === undefined) {
          process.env[key] = value;
        }
      }
      break; // stop after first found
    } catch (e: unknown) {
      // ignore parse errors; rely on existing env
      const err = handleUnknownError(e, 'Loading .env file');
      console.warn(`[vectorlint] Warning: ${err.message}`);
    }
  }
}

// Load environment variables at startup
loadDotEnv();

// Set up Commander program
program
  .name('vectorlint')
  .description('AI-powered content compliance checker')
  .version('1.0.0');
// Vale AI command is registered separately

// Options are defined per command to avoid conflicts

// Register commands
registerValidateCommand(program);
registerMainCommand(program);
registerValeAICommand(program);
    // Provider
    let directive;
    try {
      directive = loadDirective();
    } catch (e: unknown) {
      const err = handleUnknownError(e, 'Loading directive');
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
    
    const provider = createProvider(env, {
      debug: cliOptions.verbose,
      showPrompt: cliOptions.showPrompt,
      showPromptTrunc: cliOptions.showPromptTrunc,
      debugJson: cliOptions.debugJson,
    }, new DefaultRequestBuilder(directive));
    
    if (cliOptions.verbose) {
      const directiveLen = directive ? directive.length : 0;
      console.log(`[vectorlint] Directive active: ${directiveLen} char(s)`);
    }

    // Load config and prompts
    let config;
    try {
      config = loadConfig();
    } catch (e: unknown) {
      const err = handleUnknownError(e, 'Loading configuration');
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
    const { promptsPath } = config;
    if (!existsSync(promptsPath)) {
      console.error(`Error: prompts path does not exist: ${promptsPath}`);
      process.exit(1);
    }
    let prompts: PromptFile[];
    try {
      const loaded = loadPrompts(promptsPath, { verbose: cliOptions.verbose });
      prompts = loaded.prompts;
      if (prompts.length === 0) {
        console.error(`Error: no .md prompts found in ${promptsPath}`);
        process.exit(1);
      }
    } catch (e: unknown) {
      const err = handleUnknownError(e, 'Loading prompts');
      console.error(`Error: failed to load prompts: ${err.message}`);
      process.exit(1);
    }

    // Resolve target files
    let targets: string[] = [];
    try {
      targets = resolveTargets({
        cliArgs: paths,
        cwd: process.cwd(),
        promptsPath,
        scanPaths: config.scanPaths,
      });
    } catch (e: unknown) {
      const err = handleUnknownError(e, 'Resolving target files');
      console.error(`Error: failed to resolve target files: ${err.message}`);
      process.exit(1);
    }
    if (targets.length === 0) {
      console.error('Error: no target files found to evaluate.');
      process.exit(1);
    }

    let hadOperationalErrors = false;
    let hadSeverityErrors = false;
    let totalFiles = 0;
    let totalErrors = 0;
    let totalWarnings = 0;
    let requestFailures = 0;

    // Simple concurrency runner
    async function runWithConcurrency<T, R>(items: T[], limit: number, worker: (item: T, index: number) => Promise<R>): Promise<R[]> {
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

    // Load prompt/file mapping from INI (optional). If not configured, we run all prompts.
    const iniPath = path.resolve(process.cwd(), 'vectorlint.ini');
    let mapping: ReturnType<typeof readPromptMappingFromIni> | undefined;
    try {
      if (existsSync(iniPath)) {
        mapping = readPromptMappingFromIni(iniPath);
      }
    } catch (e: unknown) {
      // ignore mapping parse errors here; validate command covers this
      const err = handleUnknownError(e, 'Loading prompt mapping');
      console.warn(`[vectorlint] Warning: ${err.message}`);
      mapping = undefined;
    }

    for (const file of targets) {
      try {
        const content = readFileSync(file, 'utf-8');
        totalFiles += 1;
        const relFile = path.relative(process.cwd(), file) || file;
        printFileHeader(relFile);

        // Build schema once
        const schema = buildCriteriaJsonSchema();
        // Determine applicable prompts for this file
        const toRun: PromptFile[] = (() => {
          if (!mapping || !isMappingConfigured(mapping)) return prompts;
          return prompts.filter((p) => {
            const promptId = String(p.meta.id || p.id);
            const full = p.fullPath || path.resolve(promptsPath, p.filename);
            const alias = aliasForPromptPath(full, mapping, process.cwd());
            return resolvePromptMapping(relFile, promptId, mapping, alias);
          });
        })();

        // Run applicable prompts concurrently per config.concurrency
        const results = await runWithConcurrency(toRun, config.concurrency, async (p, _idx) => {
          try {
            const meta = p.meta;
            if (!meta || !Array.isArray(meta.criteria) || meta.criteria.length === 0) {
              throw new Error(`Prompt ${p.filename} has no criteria in frontmatter`);
            }
            const result = await provider.runPromptStructured<CriteriaResult>(content, p.body, schema);
            return { ok: true as const, result };
          } catch (e: unknown) {
            const err = handleUnknownError(e, `Running prompt ${p.filename}`);
            return { ok: false as const, error: err };
          }
        });

        // Print results in stable order
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
              hadSeverityErrors = true; promptErrors += 1;
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
            if (status === 'error') { hadSeverityErrors = true; promptErrors += 1; }
            else if (status === 'warning') { promptWarnings += 1; }
            const violations = got.violations;

            // Weighted score x/y for this criterion; no decimals if integer
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
              // Print one row per finding; include score on the first row
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
                const suggestion = status !== 'ok' && v.suggestion ? v.suggestion : undefined;
                const opts = suggestion ? { suggestion } : {};
                printIssueRow(locStr, status, rowSummary, ruleName, opts);
              }
            }
            // Record score for summary list
            criterionScores.push({ id: ruleName, scoreText });
          }
          // After rows: print per-criterion scores (each on its own line), then overall vs threshold
          printCriterionScoreLines(criterionScores);
          const thresholdOverall = meta.threshold !== undefined ? Number(meta.threshold) : undefined;
          printPromptOverallLine(promptMaxScore, thresholdOverall, promptUserScore);
          console.log('');
          if (thresholdOverall !== undefined && promptUserScore < thresholdOverall) {
            const sev = meta.severity || 'error';
            if (sev === 'error') hadSeverityErrors = true; else totalWarnings += 1;
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

    // Global summary
    printGlobalSummary(totalFiles, totalErrors, totalWarnings, requestFailures);

    const enabledEvaluators = config.evaluators?.enabled ?? [];
    if (enabledEvaluators.includes('vale-ai')) {
      try {

        // Check if Vale is installed
        const valeRunner = new ValeRunner();
        if (!valeRunner.isInstalled()) {
          console.warn('\n[vectorlint] Warning: vale-ai is enabled but Vale is not installed. Skipping Vale AI evaluation.');
          console.warn('Install Vale to use this evaluator: https://vale.sh/docs/vale-cli/installation/\n');
        } else {
          // Load vale-ai configuration
          const valeAIConfig = {
            contextWindowSize: config.evaluators?.valeAI?.contextWindowSize ?? 100
          };

          // Create ValeAIEvaluator
          const evaluator = new ValeAIEvaluator(provider, valeRunner, valeAIConfig);

          // Run evaluation on all targets
          let valeResult;
          try {
            valeResult = await evaluator.evaluate(targets);
          } catch (e: unknown) {
            const err = handleUnknownError(e, 'Running Vale AI evaluation');
            console.error(`\n[vectorlint] Vale AI evaluation failed: ${err.message}\n`);
            hadOperationalErrors = true;
          }

          // Report Vale AI results if successful
          if (valeResult && valeResult.findings.length > 0) {
            console.log('\n=== Vale AI Results ===\n');

            // Group findings by file
            const findingsByFile = new Map<string, typeof valeResult.findings>();
            for (const finding of valeResult.findings) {
              const fileFindings = findingsByFile.get(finding.file) ?? [];
              fileFindings.push(finding);
              findingsByFile.set(finding.file, fileFindings);
            }

            // Track Vale totals
            let valeErrors = 0;
            let valeWarnings = 0;
            let valeSuggestions = 0;

            // Print findings grouped by file
            for (const [file, findings] of findingsByFile) {
              const relFile = path.relative(process.cwd(), file) || file;
              printFileHeader(relFile);

              let fileErrors = 0;
              let fileWarnings = 0;
              let fileSuggestions = 0;

              for (const finding of findings) {
                const loc = `${finding.line}:${finding.column}`;
                printValeIssueRow(
                  loc,
                  finding.severity,
                  finding.rule,
                  finding.description,
                  finding.suggestion
                );

                // Count by severity
                if (finding.severity === 'error') {
                  fileErrors++;
                  valeErrors++;
                } else if (finding.severity === 'warning') {
                  fileWarnings++;
                  valeWarnings++;
                } else {
                  fileSuggestions++;
                  valeSuggestions++;
                }
              }

              // Print file summary
              printValeFileSummary(fileErrors, fileWarnings, fileSuggestions);
              console.log('');
            }

            // Print global summary
            printValeGlobalSummary(findingsByFile.size, valeErrors, valeWarnings, valeSuggestions);

            // Update error tracking
            if (valeErrors > 0) {
              hadSeverityErrors = true;
            }
          }
        }
      } catch (e: unknown) {
        const err = handleUnknownError(e, 'Loading Vale AI evaluator');
        console.error(`\n[vectorlint] Failed to load Vale AI evaluator: ${err.message}\n`);
        hadOperationalErrors = true;
      }
    }

    // Exit with 0 unless operational errors or severity errors occurred
    process.exit(hadOperationalErrors || hadSeverityErrors ? 1 : 0);
  });
>>>>>>> 066010f576699d1def27cc46d3def7828305df56

// Parse command line arguments
program.parse();
