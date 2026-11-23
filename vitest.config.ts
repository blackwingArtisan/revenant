import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
    // The second reporter checks the README's unit test count after a full run.
    reporters: ['default', './tests/readme-count.reporter.ts'],
  },
});
