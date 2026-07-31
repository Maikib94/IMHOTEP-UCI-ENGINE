import { defineConfig } from 'vitest/config';
import path from 'path';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    // Relativa al propio config, no una ruta absoluta hardcodeada — rompe en
    // CI y en cualquier otra maquina si no lo es (C1.5).
    setupFiles: [fileURLToPath(new URL('./tests/setup.ts', import.meta.url))],
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
