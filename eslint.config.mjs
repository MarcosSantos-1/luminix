import eslint from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'

const config = tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/.next/**',
      '**/.expo/**',
      '**/coverage/**',
      '**/dist/**',
      '**/legacy-source/**',
      'legacy/**',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{js,mjs,cjs,ts,tsx}'],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.browser,
      },
    },
  },
)

export default config
