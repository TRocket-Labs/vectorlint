import fetch from 'node-fetch';

/**
 * Mock Bing Web Search provider for hallucination verification.
 * Returns plausible, humanlike snippets for real and fake tools.
 */
export async function bingWebSearch(query: string, apiKey: string) {
  const q = query.toLowerCase();
  const make = (...r: { url: string; snippet: string }[]) => ({
    webPages: { value: r },
  });

  // --- Real, verifiable tools ---
  if (/\bgithub copilot\b/.test(q)) {
    return make({
      url: 'https://github.com/features/copilot',
      snippet:
        'GitHub Copilot is an AI pair programmer developed by GitHub and OpenAI, integrated into VS Code and JetBrains IDEs.',
    });
  }

  if (/\bcodeium\b/.test(q)) {
    return make({
      url: 'https://codeium.com/',
      snippet:
        'Codeium provides AI-powered code completion and enterprise on-premise deployment options.',
    });
  }

  if (/\bjetbrains ai assistant\b/.test(q)) {
    return make({
      url: 'https://www.jetbrains.com/ai/',
      snippet:
        'JetBrains AI Assistant provides code suggestions and explanations inside IntelliJ and PyCharm.',
    });
  }

  if (/\bgpt-4 turbo\b/.test(q)) {
    return make({
      url: 'https://platform.openai.com/docs/models/gpt-4-turbo',
      snippet:
        'GPT-4 Turbo is an OpenAI model optimized for efficiency and conversational tasks.',
    });
  }

  if (/\bvercel\b/.test(q) || /\bnetlify\b/.test(q)) {
    return make({
      url: 'https://vercel.com/',
      snippet:
        'Vercel and Netlify provide frontend hosting, serverless functions, and instant preview deployments.',
    });
  }

  if (/\brust\b/.test(q)) {
    return make({
      url: 'https://survey.stackoverflow.co/2025/',
      snippet:
        'Rust ranks among the most loved programming languages in the Stack Overflow 2025 survey.',
    });
  }

  if (/\btypescript\b/.test(q)) {
    return make({
      url: 'https://www.typescriptlang.org/',
      snippet:
        'TypeScript adds static type checking but cannot prevent all runtime errors.',
    });
  }

  // --- Unverifiable / likely hallucinated ---
  if (/\bdeepdeploy\b/.test(q)) {
    return make({
      url: 'https://github.com/search?q=DeepDeploy',
      snippet:
        'No known deployment automation platform called “DeepDeploy”. No public repositories or documentation found.',
    });
  }

  if (/\bstacksynth\b/.test(q)) {
    return make({
      url: 'https://github.com/search?q=StackSynth',
      snippet:
        'No project or framework called “StackSynth” found on GitHub or npm registries.',
    });
  }

  if (/\bcloudlint\b/.test(q)) {
    return make({
      url: 'https://marketplace.visualstudio.com/',
      snippet:
        'No VS Code extension or public package named “CloudLint” found in official registries.',
    });
  }

  // --- Sweeping / absolute language ---
  if (/(always|never|eliminates all|trust ai-generated)/.test(q)) {
    return make({
      url: 'https://stackoverflow.com/questions/why-typescript-doesnt-prevent-runtime-errors',
      snippet:
        'Absolute statements like “always trust AI” or “never fail” are unverifiable generalizations and lack evidence.',
    });
  }

  // --- Default fallback ---
  return make({
    url: 'https://example.com/',
    snippet: 'No relevant search results found for this query.',
  });
}
