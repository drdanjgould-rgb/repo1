// @ts-check
import tseslint from 'typescript-eslint';
import prettierConfig from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/.next/**',
      '**/next-env.d.ts',
      '**/node_modules/**',
      '**/.turbo/**',
      '**/coverage/**',
      // Legacy Python scaffold from the prior session — not part of the TS monorepo.
      'contourai/**',
      // Vestigial Claude Ads skill files from the original repo identity.
      'ads/**',
      'skills/**',
      'agents/**',
      'evals/**',
      'research/**',
      'scripts/**',
      'assets/**',
    ],
  },
  ...tseslint.configs.recommended,
  {
    rules: {
      // Errors: never silently caught. Either rethrow with context or
      // use a Result<T, E> pattern. (Spec: code conventions.)
      'no-empty': ['error', { allowEmptyCatch: false }],

      // No `any` without a justification comment. The rule errors; if a
      // line genuinely needs `any`, the developer adds a // eslint-disable-next-line
      // with the reason. This is the auditable form of "no any without justification."
      '@typescript-eslint/no-explicit-any': 'error',

      // Unused vars are OK if prefixed with _ (deliberate signal).
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  prettierConfig,
);
