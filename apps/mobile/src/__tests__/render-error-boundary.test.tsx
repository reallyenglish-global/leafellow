// SPDX-License-Identifier: Apache-2.0
import { cleanup, render, screen } from '@testing-library/react-native';

import { RenderErrorBoundary } from '../render-error-boundary';

afterEach(() => {
  cleanup();
});

test('shows a readable screen when a screen throws while rendering', async () => {
  const Thrower = () => {
    throw new Error('Cannot read properties of undefined');
  };
  const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
  try {
    await render(<RenderErrorBoundary><Thrower /></RenderErrorBoundary>);

    expect(screen.getByRole('header', { name: 'Something went wrong in Leafellow' })).toBeTruthy();
    expect(screen.getByText(/Your saved reading positions and highlights are not affected\./)).toBeTruthy();
    expect(screen.getByText('Cannot read properties of undefined')).toBeTruthy();
  } finally {
    consoleError.mockRestore();
  }
});
