#!/usr/bin/env node
import { program } from 'commander';
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { AzureOpenAIProvider } from './providers/AzureOpenAIProvider.js';
import { loadConfig } from './config/Config.js';
import { loadPrompts } from './prompts/PromptLoader.js';
import { buildCriteriaJsonSchema, type CriteriaResult } from './prompts/Schema.js';
import { printFileHeader, printIssueRow, printGlobalSummary } from './output/Reporter.js';
import { locateEvidence } from './locate/EvidenceLocator.js';
import { DefaultRequestBuilder } from './providers/RequestBuilder.js';
import { resolveTargets } from './scan/FileResolver.js';

// Best-effort .env loader without external deps
function loadDotEnv() {
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
        if (!match) continue;
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
    } catch {
      // ignore parse errors; rely on existing env
    }
  }
}

program
  .name('vectorlint')
  .description('AI-powered content compliance checker')
  .version('1.0.0')
  .option('-v, --verbose', 'Enable verbose logging')
  .option('--show-prompt', 'Print the prompt sent to the model')
  .option('--debug-json', 'Print full JSON response from the API')
  .argument('[paths...]', 'files or directories to check (optional)')
  .action(async (paths: string[] = []) => {
    // Load environment from .env if present
    loadDotEnv();
    const { verbose, showPrompt, debugJson } = program.opts<{ verbose?: boolean; showPrompt?: boolean; debugJson?: boolean }>();

    // Azure OpenAI Configuration
    const apiKey = process.env.AZURE_OPENAI_API_KEY;
    const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
    const deploymentName = process.env.AZURE_OPENAI_DEPLOYMENT_NAME;
    const apiVersion = process.env.AZURE_OPENAI_API_VERSION || '2024-02-15-preview';
    const temperatureEnv = process.env.AZURE_OPENAI_TEMPERATURE;
    const temperature = temperatureEnv !== undefined && temperatureEnv !== ''
      ? Number(temperatureEnv)
      : undefined;
    
    if (!apiKey || !endpoint || !deploymentName) {
      console.error('Error: Missing required environment variables:');
      console.error('  - AZURE_OPENAI_API_KEY');
      console.error('  - AZURE_OPENAI_ENDPOINT');
      console.error('  - AZURE_OPENAI_DEPLOYMENT_NAME');
      console.error('\\nPlease set these in your .env file or environment.');
      process.exit(1);
    }

    // Provider
    const provider = new AzureOpenAIProvider({
      apiKey,
      endpoint,
      deploymentName,
      apiVersion,
      temperature,
      debug: Boolean(verbose),
      showPrompt: Boolean(showPrompt),
      debugJson: Boolean(debugJson),
    }, new DefaultRequestBuilder());
    
    // Load config and prompts
    let config;
    try {
      config = loadConfig();
    } catch (e: any) {
      console.error(`Error: ${e?.message || e}`);
      process.exit(1);
    }
    const { promptsPath } = config;
    if (!existsSync(promptsPath)) {
      console.error(`Error: prompts path does not exist: ${promptsPath}`);
      process.exit(1);
    }
    let prompts;
    try {
      const loaded = loadPrompts(promptsPath, { verbose: Boolean(verbose) });
      prompts = loaded.prompts;
      if (prompts.length === 0) {
        console.error(`Error: no .md prompts found in ${promptsPath}`);
        process.exit(1);
      }
    } catch (e: any) {
      console.error(`Error: failed to load prompts: ${e?.message || e}`);
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
    } catch (e: any) {
      console.error(`Error: failed to resolve target files: ${e?.message || e}`);
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

    // Simple concurrency runner
    async function runWithConcurrency<T, R>(items: T[], limit: number, worker: (item: T, index: number) => Promise<R>): Promise<R[]> {
      const results: R[] = new Array(items.length) as any;
      let i = 0;
      const workers = new Array(Math.min(limit, items.length)).fill(0).map(async () => {
        while (true) {
          const idx = i++;
          if (idx >= items.length) break;
          results[idx] = await worker(items[idx], idx);
        }
      });
      await Promise.all(workers);
      return results;
    }

    for (const file of targets) {
      try {
        const content = readFileSync(file, 'utf-8');
        totalFiles += 1;
        const relFile = path.relative(process.cwd(), file) || file;
        printFileHeader(relFile);
        let fileErrors = 0;
        let fileWarnings = 0;
        // Build schema once
        const schema = buildCriteriaJsonSchema();
        // Run prompts concurrently per config.concurrency
        const results = await runWithConcurrency(prompts, config.concurrency, async (p, idx) => {
          try {
            const meta = p.meta;
            if (!meta || !Array.isArray(meta.criteria) || meta.criteria.length === 0) {
              throw new Error(`Prompt ${p.filename} has no criteria in frontmatter`);
            }
            const result = await provider.runPromptStructured<CriteriaResult>(content, p.body, schema);
            return { ok: true as const, result };
          } catch (e) {
            return { ok: false as const, error: e };
          }
        });

        // Print results in stable order
        for (let idx = 0; idx < prompts.length; idx++) {
          const p = prompts[idx];
          const r = results[idx];
          if (!r) continue;
          if (r.ok !== true) {
            console.error(`  Prompt failed: ${p.filename}`);
            console.error(r.error);
            hadOperationalErrors = true;
            continue;
          }
          const meta = p.meta;
          const promptId = (meta.id || '').toString();
          const result = r.result;
          const expectedNames = new Set<string>(meta.criteria.map(c => String(c.name)));
          const returnedNames = new Set(result.criteria.map(c => c.name));
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
          const issuesMap = new Map<string, { threshold: number; severity: 'warning' | 'error' }>();
          for (const exp of meta.criteria) {
            const nameKey = String(exp.name);
            const got = result.criteria.find(c => c.name === nameKey);
            if (!got) continue;
            const score = Number(got.score) as number;
            if (!Number.isFinite(score) || score < 0 || score > 4) {
              console.error(`Invalid score for ${exp.name}: ${score}`);
              hadOperationalErrors = true;
              continue;
            }
            const effThreshold = exp.threshold ?? meta.threshold ?? 3;
            const effSeverity = (meta.severity as any) || exp.severity || 'warning';
            issuesMap.set(nameKey, { threshold: effThreshold, severity: effSeverity as any });
          }
          for (const exp of meta.criteria) {
            const nameKey = String(exp.name);
            const got = result.criteria.find(c => c.name === nameKey);
            if (!got) continue;
            const conf = issuesMap.get(nameKey)!;
            const score = Number(got.score);
            let status: 'ok' | 'warning' | 'error' = 'ok';
            if (score < conf.threshold) {
              status = conf.severity === 'error' ? 'error' : 'warning';
              if (status === 'error') { hadSeverityErrors = true; promptErrors += 1; }
              else { promptWarnings += 1; }
            }
            const summary = (got.analysis || '').trim();
            const criterionId = (exp.id ? String(exp.id) : (exp.name ? String(exp.name).replace(/[^A-Za-z0-9]+/g, ' ').split(' ').filter(Boolean).map(s=>s[0].toUpperCase()+s.slice(1)).join('') : ''));
            const ruleName = promptId && criterionId ? `${promptId}.${criterionId}` : (promptId || criterionId || p.filename);
            // Locate evidence in content to compute line:col
            let locStr = '—:—';
            try {
              const ev = (got as any).evidence as { quote: string; pre: string; post: string };
              const loc = ev ? locateEvidence(content, ev) : null;
              if (loc) locStr = `${loc.line}:${loc.column}`;
              else { hadOperationalErrors = true; }
            } catch {
              hadOperationalErrors = true;
            }
            printIssueRow(locStr, status, summary, ruleName);
          }
          fileErrors += promptErrors;
          fileWarnings += promptWarnings;
          totalErrors += promptErrors;
          totalWarnings += promptWarnings;
        }
        console.log('');
      } catch (error) {
        console.error(`Error processing file ${file}:`, error);
        hadOperationalErrors = true;
      }
    }

    // Global summary
    printGlobalSummary(totalFiles, totalErrors, totalWarnings);

    // Exit with 0 unless operational errors or severity errors occurred
    process.exit(hadOperationalErrors || hadSeverityErrors ? 1 : 0);
  });

program.parse();
