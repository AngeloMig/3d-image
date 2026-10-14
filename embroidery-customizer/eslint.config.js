import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/build/**',
      '**/node_modules/**',
      'extensions/*/assets/**',
      '.react-router/**',
      '.shopify/**',
      'playwright-report/**',
      'test-results/**',
      'prisma/**',
      'node_modules/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
  {
    // Shopify template files keep their upstream style.
    files: ['app/db.server.ts', 'app/globals.d.ts', 'app/entry.server.tsx', 'app/root.tsx', 'app/routes/auth.*', 'app/routes/_index/**', 'app/routes/webhooks.app.*', 'app/routes/app.tsx'],
    linterOptions: { reportUnusedDisableDirectives: 'off' },
    rules: { '@typescript-eslint/no-namespace': 'off', 'no-var': 'off' },
  },
);
