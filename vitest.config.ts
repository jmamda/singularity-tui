import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/__tests__/**/*.test.{ts,tsx}'],
    reporters: ['default'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/__tests__/**',
        'src/**/*.test.ts',
        'src/cli.tsx',
        'src/App.tsx',
        'src/components/**',
        'src/iterm/**',
        'src/wizard.ts',
        'src/showcase.ts',
      ],
      // Thresholds set to current floor — they can only ratchet upward in PRs.
      // Raise these as more of the OS-event / TUI surfaces get covered.
      thresholds: {
        lines: 28,
        functions: 25,
        statements: 27,
        branches: 22,
      },
    },
  },
});
