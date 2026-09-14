// Flat config. The determinism rules (CONTRACT.md §1) are enforced here:
// no wall clock, no unseeded randomness in physics, tracks or the audio model.
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const DETERMINISTIC_PATHS = ['src/physics/**/*.ts', 'src/tracks/**/*.ts', 'src/audio/model/**/*.ts', 'src/core/**/*.ts'];

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'harness/out/**', 'reference/**', '**/*.d.ts'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }],
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      'no-console': ['warn', { allow: ['info', 'warn', 'error'] }],
    },
  },
  {
    // CLI tools print.
    files: ['harness/**/*.ts', 'vite.config.ts'],
    rules: { 'no-console': 'off' },
  },
  {
    files: DETERMINISTIC_PATHS,
    ignores: ['**/*.test.ts', 'src/core/loop.ts'],
    rules: {
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Use the seeded Rng from src/core/rng.ts (CONTRACT §1).' },
        { object: 'performance', property: 'now', message: 'No wall clock in deterministic code (CONTRACT §1).' },
        { object: 'Date', property: 'now', message: 'No wall clock in deterministic code (CONTRACT §1).' },
        { object: 'window', property: 'performance', message: 'No wall clock in deterministic code (CONTRACT §1).' },
        { object: 'globalThis', property: 'performance', message: 'No wall clock in deterministic code (CONTRACT §1).' },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'Date', message: 'No wall clock in deterministic code (CONTRACT §1).' },
        { name: 'performance', message: 'No wall clock in deterministic code (CONTRACT §1).' },
        { name: 'requestAnimationFrame', message: 'Deterministic code is clocked by ticks, not frames.' },
        { name: 'setTimeout', message: 'Deterministic code is clocked by ticks, not timers.' },
        { name: 'setInterval', message: 'Deterministic code is clocked by ticks, not timers.' },
      ],
      'no-restricted-syntax': [
        'error',
        { selector: "NewExpression[callee.name='Date']", message: 'No wall clock in deterministic code (CONTRACT §1).' },
      ],
    },
  },
);
