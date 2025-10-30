import fetch from 'node-fetch';

/**
 * Simulated Bing search used for hallucination verification testing.
 * Returns realistic results for plausible and real tool names.
 */
export async function bingWebSearch(query: string, apiKey: string): Promise<any> {
  const lower = query.toLowerCase();
  const make = (...results: { url: string; snippet: string }[]) => ({
    webPages: { value: results },
  });

  // --- Real Tools ---
  if (/\b(vite|turbo\s*pack|esbuild|bun)\b/.test(lower)) {
    return make(
      {
        url: 'https://vitejs.dev/',
        snippet: 'Vite is a next-generation, lightning-fast frontend build tool.',
      },
      {
        url: 'https://turbo.build/pack',
        snippet: 'Turbopack is an incremental bundler optimized for JavaScript and Rust-based projects.',
      },
      {
        url: 'https://esbuild.github.io/',
        snippet: 'esbuild is an extremely fast JavaScript bundler written in Go.',
      },
      {
        url: 'https://bun.sh/',
        snippet: 'Bun is a fast all-in-one JavaScript runtime, bundler, and package manager.',
      }
    );
  }

  // --- Hallucinated / Unverifiable Tools ---
  if (/\bautodeployx\b/.test(lower)) {
    return make(
      {
        url: 'https://github.com/search?q=AutoDeployX',
        snippet:
          'No official repository or documentation found for “AutoDeployX”. Possibly an informal or hypothetical tool.',
      },
      {
        url: 'https://aws.amazon.com/devops/continuous-delivery/',
        snippet:
          'AWS and GitHub Actions support CI/CD automation, but no tool named AutoDeployX exists in major registries.',
      }
    );
  }

  if (/\breactqueryplus\b/.test(lower)) {
    return make(
      {
        url: 'https://tanstack.com/query/latest',
        snippet: 'TanStack Query (React Query) provides caching and fetching utilities for React.',
      },
      {
        url: 'https://www.npmjs.com/search?q=reactqueryplus',
        snippet: 'No npm package found for “reactqueryplus”.',
      }
    );
  }

  if (/\binstantlint\b/.test(lower)) {
    return make(
      {
        url: 'https://marketplace.visualstudio.com/',
        snippet: 'No extension named “InstantLint” appears in the VS Code marketplace.',
      },
      {
        url: 'https://eslint.org/',
        snippet: 'ESLint is the standard linting tool for JavaScript and TypeScript projects.',
      }
    );
  }

  // --- Sweeping / Absolute Claims ---
  if (/(always prevents runtime errors|never fail|guaranteed success)/.test(lower)) {
    return make(
      {
        url: 'https://www.typescriptlang.org/',
        snippet:
          'TypeScript improves safety at compile time but cannot prevent all runtime errors.',
      },
      {
        url: 'https://stackoverflow.com/questions/why-typescript-doesnt-prevent-runtime-errors',
        snippet:
          'TypeScript types are erased at runtime; logic errors can still occur.',
      }
    );
  }

  // --- Default fallback ---
  return { webPages: { value: [] } };
}
