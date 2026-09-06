// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', '.expo/*'],
  },
  {
    rules: {
      // This app loads its data synchronously from expo-sqlite inside mount
      // effects and then calls setState — a legitimate pattern here that this
      // React-Compiler-era rule cannot tell apart from the derived-state
      // anti-pattern. Left as a plain rule elsewhere; disabled project-wide.
      'react-hooks/set-state-in-effect': 'off',
    },
  },
]);
