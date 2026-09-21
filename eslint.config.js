// jsx-a11y strict — added after the full ui-ux-audit (2026-09-22) found
// 5 clickable divs with no role/tabIndex/onKeyDown that had already been
// fixed once, by hand, in HourPlan.tsx and never applied to the other
// four sites carrying the same pattern. This is the guard that stops a
// fifth one from landing unnoticed.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', 'node_modules/.cache/**', 'renderer/dist/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  jsxA11y.flatConfigs.recommended,
  {
    files: ['renderer/src/**/*.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.browser },
    },
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'off',
      // Only the two classic rules — v7 also ships a set of React
      // Compiler-prep rules (set-state-in-effect, refs, purity, ...)
      // that flag long-standing, deliberate patterns throughout this
      // codebase (ref-during-render, setState-in-effect data fetches);
      // out of scope for this pass, which exists to lock in jsx-a11y.
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
);
