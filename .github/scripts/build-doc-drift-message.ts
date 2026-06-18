import { writeFile } from 'node:fs/promises';

const [, , DIFF_PATH, OUTPUT_PATH] = process.argv;

if (!DIFF_PATH || !OUTPUT_PATH) {
  throw new Error('Usage: tsx .github/scripts/build-doc-drift-message.ts <diff-path> <output-path>');
}

const WORKSPACE = process.env.GITHUB_WORKSPACE;

if (!WORKSPACE) {
  throw new Error('GITHUB_WORKSPACE is required');
}

const MESSAGE = `You are running a doc drift check on a pull request in the VectorLint repository.

The pull request checkout to inspect is located at:
  ${WORKSPACE}

Read the PR diff from this file:
  ${DIFF_PATH}

Use the doc-drift skill. When you have finished, write one report file
per behavioral change you identified, named sequentially:
  ${WORKSPACE}/.doc-drift-1.md
  ${WORKSPACE}/.doc-drift-2.md
  ... and so on.

If there are no issues to report, write a single file ${WORKSPACE}/.doc-drift-1.md
containing the no-issues-found report.

Do not post anything to GitHub directly. The workflow will handle posting.
`;

await writeFile(OUTPUT_PATH, MESSAGE);
