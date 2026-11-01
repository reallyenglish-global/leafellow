// SPDX-License-Identifier: Apache-2.0
import { cleanup, render, screen } from '@testing-library/react-native';

import { DatabaseErrorBoundary } from '../database-error-boundary';

afterEach(() => {
  cleanup();
});

test('shows a readable screen when the database cannot be opened', async () => {
  const Thrower = () => {
    throw new Error('Unsupported saved-highlight schema version');
  };
  const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
  try {
    await render(<DatabaseErrorBoundary><Thrower /></DatabaseErrorBoundary>);

    expect(screen.getByRole('header', { name: 'Leafellow could not open its local data' })).toBeTruthy();
    expect(screen.getByText(/Nothing was deleted\./)).toBeTruthy();
    expect(screen.getByText('Unsupported saved-highlight schema version')).toBeTruthy();
  } finally {
    consoleError.mockRestore();
  }
});
