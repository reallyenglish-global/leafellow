// SPDX-License-Identifier: Apache-2.0
module.exports = {
  preset: 'jest-expo',
  // Core modules under src/ import each other with explicit .ts extensions.
  moduleNameMapper: { '^(\\.{1,2}/.*)\\.ts$': '$1' },
  // The first render in a cold cache transforms much of react-native lazily and can exceed 5s.
  testTimeout: 30000,
  testMatch: ['<rootDir>/src/**/__tests__/**/*.test.tsx', '<rootDir>/src/__tests__/**/*.test.tsx'],
};
