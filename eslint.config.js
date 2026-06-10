import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  { ignores: ['dist/', 'coverage/', 'node_modules/'] },
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // The React-Compiler purity diagnostics flag Date.now()/refs during
      // render, which this Ink TUI uses deliberately for tick-driven
      // animation. Keep rules-of-hooks + exhaustive-deps, drop purity.
      'react-hooks/purity': 'off',
      'react-hooks/refs': 'off',
      'react-hooks/set-state-in-render': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      // The codebase still has a handful of `any`s at parser internals; keep
      // them visible as warnings rather than blocking lint.
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
  {
    files: ['src/**/__tests__/**'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
);
