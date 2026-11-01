// SPDX-License-Identifier: Apache-2.0
const expoConfig = require('eslint-config-expo/flat');

module.exports = [
  ...expoConfig,
  { ignores: ['ios/**', 'android/**', '.expo/**', 'dist/**', 'web-build/**'] },
];
