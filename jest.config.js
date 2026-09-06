/**
 * Unit tests for the pure calculation core (utils/calculations.ts + utils/time.ts).
 *
 * These files deliberately have no React Native / Expo / database imports, so a
 * plain ts-jest + node setup is enough — no jest-expo, no native mocks. The
 * dedicated tsconfig.jest.json keeps this compile isolated from the app's
 * Expo/TypeScript config.
 *
 *   npm test
 *   npm test -- --watch
 */
/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/utils'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.jest.json' }],
  },
};
