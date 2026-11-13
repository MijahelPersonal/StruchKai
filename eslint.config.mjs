import eslint from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/coverage/**'] },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx,cts,mjs}'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['apps/{frontend,admin}/src/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
  },
);
