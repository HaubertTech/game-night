import { defineConfig } from 'vitest/config';

// Engine and script tests are plain TypeScript; they do not need the SvelteKit plugin.
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
