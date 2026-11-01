// SPDX-License-Identifier: Apache-2.0
const expoConfig = require('eslint-config-expo/flat');

module.exports = [
  ...expoConfig,
  { ignores: ['ios/**', 'android/**', '.expo/**', 'dist/**', 'web-build/**'] },
  {
    // Task 5 (reader hooks extraction) fixes these in the extracted hooks and removes this block.
    rules: {
      'react-hooks/refs': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/purity': 'warn',
    },
  },
];
