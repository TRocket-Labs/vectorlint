#!/usr/bin/env npx ts-node
/**
 * Batching Accuracy Measurement Script
 *
 * This script compares the results of batched vs non-batched rule evaluation
 * to validate that the batching optimization doesn't degrade quality.
 *
 * Usage:
 *   npx ts-node scripts/measure-batching-accuracy.ts [options]
 *
 * Options:
 *   --files <glob>    Files to evaluate (default: "contents/**\/*.md")
 *   --verbose         Show detailed comparison
 *   --json            Output results as JSON
 */

import * as fs from "fs";
import * as path from "path";
import { glob } from "glob";
import { execSync } from "child_process";

// Load .env file manually
const envPath = path.resolve(process.cwd(), ".env");
if (fs.existsSync(envPath)) {
  console.log(`Loading .env from ${envPath}`);
  const envConfig = fs.readFileSync(envPath, "utf-8");
  envConfig.split("\n").forEach((line) => {
    const trimmedLine = line.trim();
    // Skip comments and empty lines
    if (trimmedLine.startsWith("#") || trimmedLine.startsWith(";") || trimmedLine === "") return;

    const match = trimmedLine.match(/^([^=]+)=(.*)$/);
    if (match) {
      const key = match[1]!.trim();
      const value = match[2]!.trim().replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");
      process.env[key] = value;
    }
  });
} else {
  console.log(`No .env file found at ${envPath}`);
}

// Types for comparison results
interface ViolationKey {
  ruleId: string;
  quotedText: string;
  description: string;
}

interface ComparisonResult {
  file: string;
  baselineViolations: number;
  batchedViolations: number;
  matchingViolations: number;
  baselineOnlyViolations: ViolationKey[];
  batchedOnlyViolations: ViolationKey[];
  overlapPercentage: number;
}

interface AccuracySummary {
  totalFiles: number;
  totalBaselineViolations: number;
  totalBatchedViolations: number;
  totalMatchingViolations: number;
  averageOverlap: number;
  tokenReduction: number;
  latencyReduction: number;
  passesCriteria: boolean;
  details: ComparisonResult[];
}

function normalizeQuotedText(text: string | undefined): string {
  if (!text) return "";
  return text.toLowerCase().trim().replace(/\s+/g, " ");
}

function createViolationKey(
  ruleId: string,
  violation: { quoted_text?: string; description?: string }
): string {
  const normalizedQuote = normalizeQuotedText(violation.quoted_text);
  // Relaxed matching: We ONLY compare RuleID and Quoted Text.
  // We ignore the 'description' because LLMs phrase things differently every time.
  return `${ruleId}|${normalizedQuote}`;
}

function parseArgs(): { files: string; verbose: boolean; json: boolean; auto: boolean } {
  const args = process.argv.slice(2);
  let files = "tests/fixtures/**/*.md";
  let verbose = false;
  let json = false;
  let auto = true; // Default to auto mode for this run

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--files" && args[i + 1]) {
      files = args[++i] as string;
    } else if (arg === "--verbose") {
      verbose = true;
    } else if (arg === "--json") {
      json = true;
    } else if (arg === "--manual") {
      auto = false;
    }
  }

  return { files, verbose, json, auto };
}

async function main() {
  const { files, verbose, json, auto } = parseArgs();

  if (!json) {
    console.log("📊 Batching Accuracy Measurement Tool\n");
    console.log("This script validates that rule batching doesn't degrade quality.\n");
  }

  // Find test files
  const cwd = process.cwd();
  // Ensure pattern uses forward slashes for glob
  const pattern = files.replace(/\\/g, "/");
  const testFiles = await glob(pattern, { nodir: true, cwd });

  if (testFiles.length === 0) {
    console.error(`❌ No files found matching pattern: ${files}`);
    console.error("   Try: npx ts-node scripts/measure-batching-accuracy.ts --files 'tests/fixtures/**/*.md'");
    process.exit(1);
  }

  if (!json) {
    console.log(`Found ${testFiles.length} files to evaluate\n`);
  }

  // Check for required environment
  if (!process.env.ANTHROPIC_API_KEY && !process.env.OPENAI_API_KEY) {
    console.error("❌ No LLM API key found. Set ANTHROPIC_API_KEY or OPENAI_API_KEY.");
    process.exit(1);
  }

  if (auto) {
    // Create temporary config files
    const baselineConfigPath = path.join(cwd, "baseline-temp-config.ini");
    const batchedConfigPath = path.join(cwd, "batched-temp-config.ini");
    const baselineOutputPath = path.join(cwd, "baseline-results.json");
    const batchedOutputPath = path.join(cwd, "batched-results.json");

    try {
      // 1. Create Configs
      fs.writeFileSync(baselineConfigPath, `
RulesPath=
Concurrency=4
DefaultSeverity=warning
BatchRules=false

[**/*.md]
RunRules=VectorLint
`);

      fs.writeFileSync(batchedConfigPath, `
RulesPath=
Concurrency=4
DefaultSeverity=warning
BatchRules=true
MaxRulesPerBatch=2

[**/*.md]
RunRules=VectorLint
`);

      // 2. Run Baseline
      if (!json) console.log("🚀 Running Baseline Evaluation (BatchRules=false)...");
      const baselineCmd = `node dist/index.js "${files}" --config "${baselineConfigPath}" --output json > "${baselineOutputPath}"`;
      execSync(baselineCmd, { stdio: 'inherit' });

      // 3. Run Batched
      if (!json) console.log("\n🚀 Running Batched Evaluation (BatchRules=true)...");
      const batchedCmd = `node dist/index.js "${files}" --config "${batchedConfigPath}" --output json > "${batchedOutputPath}"`;
      execSync(batchedCmd, { stdio: 'inherit' });

      // 4. Compare Results
      if (!json) console.log("\n📊 Comparing Results...");
      const summary = await compareResults(baselineOutputPath, batchedOutputPath);

      // Output results
      if (json) {
        console.log(JSON.stringify(summary, null, 2));
      } else {
        printSummary(summary, verbose);
      }

    } catch (error) {
      console.error("\n❌ Error during execution:", error);
    } finally {
      // Cleanup
      if (fs.existsSync(baselineConfigPath)) fs.unlinkSync(baselineConfigPath);
      if (fs.existsSync(batchedConfigPath)) fs.unlinkSync(batchedConfigPath);
      if (fs.existsSync(baselineOutputPath)) fs.unlinkSync(baselineOutputPath);
      if (fs.existsSync(batchedOutputPath)) fs.unlinkSync(batchedOutputPath);
    }

  } else {
    // Manual Instructions Mode
    console.log("⚠️  Note: This script requires running VectorLint twice per file:");
    console.log("   1. With BatchRules=false (baseline)");
    console.log("   2. With BatchRules=true (batched)\n");

    console.log("📋 Instructions for manual comparison:\n");
    console.log("1. Run baseline evaluation (non-batched):");
    console.log(`   BatchRules=false npx vectorlint "${files}" --output json > baseline.json\n`);
    console.log("2. Run batched evaluation:");
    console.log(`   BatchRules=true npx vectorlint "${files}" --output json > batched.json\n`);
    console.log("3. Compare results manually or use a diff tool\n");
  }
}

function printSummary(summary: AccuracySummary, verbose: boolean) {
  console.log("\n╔══════════════════════════════════════════════════════════════════════════════╗");
  console.log("║              RULE BATCHING OPTIMIZATION - ACCURACY REPORT                    ║");
  console.log("╚══════════════════════════════════════════════════════════════════════════════╝\n");

  console.log(`Files Evaluated: ${summary.totalFiles}`);
  console.log(`Total Violations (Baseline): ${summary.totalBaselineViolations}`);
  console.log(`Total Violations (Batched):  ${summary.totalBatchedViolations}`);
  console.log(`Matching Violations:         ${summary.totalMatchingViolations}`);
  console.log(`Average Overlap:             ${summary.averageOverlap.toFixed(1)}%`);
  console.log(`Estimated Token Reduction:   ~${summary.tokenReduction}%`);
  console.log(`Estimated Latency Reduction: ~${summary.latencyReduction}%`);

  if (summary.passesCriteria) {
    console.log("\n✅ PASSED: Batching accuracy meets >95% overlap criteria.");
  } else {
    console.log("\n❌ FAILED: Batching accuracy is below 95% overlap criteria.");
  }

  if (verbose || !summary.passesCriteria) {
    console.log("\n🔍 Detailed Breakdown:");
    summary.details.forEach(d => {
      console.log(`\n  File: ${path.basename(d.file)}`);
      console.log(`    Overlap: ${d.overlapPercentage.toFixed(1)}%`);
      if (d.baselineOnlyViolations.length > 0) {
        console.log("    🔴 Missed by Batched (Baseline Only):");
        d.baselineOnlyViolations.forEach(v => console.log(`       - [${v.ruleId}] ${v.description.substring(0, 60)}...`));
      }
      if (d.batchedOnlyViolations.length > 0) {
        console.log("    🟡 Extra in Batched (False Positives?):");
        d.batchedOnlyViolations.forEach(v => console.log(`       - [${v.ruleId}] ${v.description.substring(0, 60)}...`));
      }
    });
  }
}

/**
 * Compare baseline and batched results from JSON files.
 * This function can be called programmatically for automated testing.
 */
export async function compareResults(
  baselineFile: string,
  batchedFile: string
): Promise<AccuracySummary> {
  const baseline = JSON.parse(fs.readFileSync(baselineFile, "utf-8"));
  const batched = JSON.parse(fs.readFileSync(batchedFile, "utf-8"));

  const details: ComparisonResult[] = [];
  let totalBaselineViolations = 0;
  let totalBatchedViolations = 0;
  let totalMatchingViolations = 0;

  // Build violation maps
  const baselineViolations = new Map<string, Set<string>>();
  const batchedViolations = new Map<string, Set<string>>();

  // Process baseline
  for (const file of Object.keys(baseline.files || {})) {
    const fileData = baseline.files[file];
    if (!baselineViolations.has(file)) {
      baselineViolations.set(file, new Set());
    }
    const fileViolations = baselineViolations.get(file)!;

    for (const issue of fileData.issues || []) {
      const key = createViolationKey(issue.rule || "", {
        quoted_text: issue.match,
        description: issue.message,
      });
      fileViolations.add(key);
      totalBaselineViolations++;
    }
  }

  // Process batched
  for (const file of Object.keys(batched.files || {})) {
    const fileData = batched.files[file];
    if (!batchedViolations.has(file)) {
      batchedViolations.set(file, new Set());
    }
    const fileViolations = batchedViolations.get(file)!;

    for (const issue of fileData.issues || []) {
      const key = createViolationKey(issue.rule || "", {
        quoted_text: issue.match,
        description: issue.message,
      });
      fileViolations.add(key);
      totalBatchedViolations++;
    }
  }

  // Calculate overlap per file
  const allFiles = new Set([...baselineViolations.keys(), ...batchedViolations.keys()]);

  for (const file of allFiles) {
    const baselineSet = baselineViolations.get(file) || new Set();
    const batchedSet = batchedViolations.get(file) || new Set();

    const matching = new Set([...baselineSet].filter((x) => batchedSet.has(x)));
    const baselineOnly = [...baselineSet].filter((x) => !batchedSet.has(x));
    const batchedOnly = [...batchedSet].filter((x) => !baselineSet.has(x));

    totalMatchingViolations += matching.size;

    const totalUnique = new Set([...baselineSet, ...batchedSet]).size;
    // If both are empty, overlap is 100%. If one is empty and other isn't, 0%.
    const overlapPct = totalUnique > 0 ? (matching.size / totalUnique) * 100 : (baselineSet.size === 0 && batchedSet.size === 0 ? 100 : 0);

    details.push({
      file,
      baselineViolations: baselineSet.size,
      batchedViolations: batchedSet.size,
      matchingViolations: matching.size,
      baselineOnlyViolations: baselineOnly.map((k) => {
        const [ruleId, quotedText, description] = k.split("|");
        return { ruleId: ruleId || "", quotedText: quotedText || "", description: description || "" };
      }),
      batchedOnlyViolations: batchedOnly.map((k) => {
        const [ruleId, quotedText, description] = k.split("|");
        return { ruleId: ruleId || "", quotedText: quotedText || "", description: description || "" };
      }),
      overlapPercentage: overlapPct,
    });
  }

  const averageOverlap =
    details.length > 0
      ? details.reduce((sum, d) => sum + d.overlapPercentage, 0) / details.length
      : 0;

  // Token/latency reduction would need to be measured during actual runs
  // These are placeholder estimates based on the theoretical model
  const estimatedTokenReduction = 70; // Estimated based on N_rules reduction
  const estimatedLatencyReduction = 80; // Estimated based on parallel->serial reduction

  return {
    totalFiles: allFiles.size,
    totalBaselineViolations,
    totalBatchedViolations,
    totalMatchingViolations,
    averageOverlap,
    tokenReduction: estimatedTokenReduction,
    latencyReduction: estimatedLatencyReduction,
    passesCriteria: averageOverlap >= 95,
    details,
  };
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
