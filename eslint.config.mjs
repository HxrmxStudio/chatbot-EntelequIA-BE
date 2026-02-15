import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';

export default [
  {
    files: ['src/**/*.ts', 'test/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        project: './tsconfig.json'
      }
    },
    plugins: {
      '@typescript-eslint': tsPlugin
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }]
    }
  },
  {
    files: ['src/**/*.ts'],
    rules: {
      'max-lines': ['error', { max: 1200, skipBlankLines: true, skipComments: true }],
      'max-lines-per-function': [
        'error',
        { max: 650, skipBlankLines: true, skipComments: true },
      ],
    },
  },
  {
    files: ['src/modules/wf1/application/use-cases/handle-incoming-message/**/*.ts'],
    rules: {
      'max-lines': ['error', { max: 500, skipBlankLines: true, skipComments: true }],
      'max-lines-per-function': [
        'error',
        { max: 200, skipBlankLines: true, skipComments: true },
      ],
    },
  }
];
