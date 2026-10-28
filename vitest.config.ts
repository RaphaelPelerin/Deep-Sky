import { defineConfig } from 'vitest/config';

// separate from vite.config.ts, whose root is the demo site
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
  },
});
