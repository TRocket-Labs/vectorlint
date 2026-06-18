import { writeFile } from 'node:fs/promises';

const [, , diffPath, outputPath] = process.argv;

if (!diffPath || !outputPath) {
  throw new Error('Usage: tsx .github/scripts/build-doc-drift-message.ts <diff-path> <output-path>');
}

const workspace = process.env.GITHUB_WORKSPACE;

if (!workspace) {
  throw new Error('GITHUB_WORKSPACE is required');
}

const message = `You are running a doc drift check on a pull request in the VectorLint repository.

The pull request checkout to inspect is located at:
  ${workspace}

Read the PR diff from this file:
  ${diffPath}

Use the doc-drift skill. When you have finished, write one report file
per behavioral change you identified, named sequentially:
  ${workspace}/.doc-drift-1.md
  ${workspace}/.doc-drift-2.md
  ... and so on.

If there are no issues to report, write a single file ${workspace}/.doc-drift-1.md
containing the no-issues-found report.

Do not post anything to GitHub directly. The workflow will handle posting.
`;

await writeFile(outputPath, message);
