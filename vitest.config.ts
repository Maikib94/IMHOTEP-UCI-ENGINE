import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: [path.resolve(__dirname, 'tests/setup.ts')],
    css: false,
    exclude: ['tests/e2e/**', 'node_modules/**'],
    coverage: {
      provider: 'v8',
      thresholds: { lines: 70, branches: 60, functions: 70 },
      exclude: ['**/*.spec.ts', '**/main.tsx', '**/index.css', 'tests/**'],
    },
    server: {
      deps: {
        inline: ['zustand'],
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
