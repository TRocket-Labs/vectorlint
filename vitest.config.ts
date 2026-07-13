import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Tests live under tests/ and follow the *.test.ts convention.
    include: ['tests/**/*.test.ts'],
    // Inline heavy/ESM-only deps so suites that transitively import the
    // agent (ora) or observability (@langfuse/otel, @opentelemetry/sdk-node)
    // modules resolve reliably without relying on scattered per-file mocks.
    server: {
      deps: {
        inline: ['ora', '@langfuse/otel', '@opentelemetry/sdk-node'],
      },
    },
  },
});
