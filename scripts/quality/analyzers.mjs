import { createRequire } from 'node:module';
import { ESLint } from 'eslint';
import parser from '@typescript-eslint/parser';
import sonarjs from 'eslint-plugin-sonarjs';

const require = createRequire(import.meta.url);
// jscpd's ESM bundle imports colors/safe without its required extension.
const { detectClonesAndStatistic } = require('jscpd');

export const createComplexityAnalyzer = () => new ESLint({ overrideConfigFile: true, allowInlineConfig: false,
  overrideConfig: [{ files: ['**/*.{ts,tsx}'], languageOptions: { parser, parserOptions: { ecmaFeatures: { jsx: true } } },
    plugins: { sonarjs }, rules: { complexity: ['warn', { max: 0, variant: 'classic' }], 'sonarjs/cognitive-complexity': ['warn', 0] } }] });

export const duplicationSettings = { minLines: 5, minTokens: 70, maxLines: 1000000, maxSize: '10mb',
  mode: 'weak', format: ['typescript', 'tsx'], reporters: [], silent: true, noTips: true, absolute: true,
  gitignore: false }; // Explicit input list already applies repository scope; ignore host-global Git settings.

export const measureDuplication = paths => detectClonesAndStatistic({
  ...duplicationSettings, path: paths.map(path => path.replaceAll('\\', '/'))
});
