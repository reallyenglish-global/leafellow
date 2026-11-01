// SPDX-License-Identifier: Apache-2.0
import { AppState } from 'react-native';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { latestReaderProps, makeBook, openTestDatabase, resetEngineMock } from './engine-mock';
import { loadLastReadingPosition } from '../../../../../src/storage/reading-position';
import { saveHighlight } from '../../../../../src/storage/saved-highlights';
import { systemFolderDestination } from '../../highlight-export-destination';
import { ReaderScreen } from '../reader-screen';

const SELECTION_CFI = 'epubcfi(/6/2!/4/4,/1:0,/1:8)';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

function props() {
  const current = latestReaderProps();
  if (!current) throw new Error('the engine has not rendered yet');
  return current;
}

// The engine only renders once the frame has been measured.
async function measureFrame() {
  await fireEvent(screen.getByTestId('reader-frame'), 'layout', { nativeEvent: { layout: { width: 400, height: 600 } } });
}

async function engineReady(href = 'c1.xhtml') {
  await act(() => { props().onReady?.(10, { start: { href } } as never, {} as never); });
}

async function select(text = 'Luminous', cfi = SELECTION_CFI) {
  await act(() => { props().onSelected?.(text, cfi); });
}

// Every statement the test database ran that wrote a reading position.
function positionWrites(db: object) {
  return (db as { statements: string[] }).statements.filter(statement => statement.includes('INSERT INTO last_reading_position'));
}

function relocate(cfi: string) {
  props().onLocationChange?.(1, { start: { href: 'c1.xhtml', cfi } } as never, 10 as never, 0 as never);
}

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
  cleanup();
  resetEngineMock();
});

test('save stays disabled until the highlight list has loaded', async () => {
  const db = await openTestDatabase();
  const gate = deferred<void>();
  const getAll = db.getAllAsync.bind(db);
  db.getAllAsync = (async (...args: Parameters<typeof getAll>) => { await gate.promise; return getAll(...args); }) as typeof db.getAllAsync;

  await render(<ReaderScreen book={makeBook()} onClose={jest.fn()} />);
  await measureFrame();
  await engineReady();
  await select();

  expect(screen.getByText('Waiting for saved highlights…')).toBeTruthy();
  expect(screen.getByTestId('save-highlight')).toBeDisabled();

  gate.resolve();

  expect(await screen.findByText('Save highlight')).toBeTruthy();
  expect(screen.getByTestId('save-highlight')).toBeEnabled();
});

test('a running export blocks save, delete and close until it settles', async () => {
  const db = await openTestDatabase();
  const book = makeBook();
  await saveHighlight(db, { documentId: book.id, exact: 'Luminous', cfi: SELECTION_CFI, href: 'c1.xhtml', createdAt: 1 });
  const folder = deferred<null>();
  jest.mocked(systemFolderDestination.pickFolder).mockReturnValue(folder.promise);

  await render(<ReaderScreen book={book} onClose={jest.fn()} />);
  await measureFrame();
  await engineReady();

  await fireEvent.press(await screen.findByText('Show highlights (1)'));
  await fireEvent.press(await screen.findByTestId('export-start'));
  await fireEvent.press(await screen.findByTestId('export-acknowledge'));
  await fireEvent.press(screen.getByTestId('export-confirm'));

  expect(await screen.findByText('Exporting… do not close the app')).toBeTruthy();
  expect(screen.getByTestId('reader-back')).toBeDisabled();
  expect(screen.getByTestId('highlight-delete')).toBeDisabled();

  await act(async () => { folder.resolve(null); });

  expect(await screen.findByText('Export cancelled. No file was created.')).toBeTruthy();
  expect(screen.getByTestId('reader-back')).toBeEnabled();
});

test('a pending selection is cleared when the reader moves to another chapter', async () => {
  await openTestDatabase();
  await render(<ReaderScreen book={makeBook()} onClose={jest.fn()} />);
  await measureFrame();
  await engineReady('c1.xhtml');
  await select();
  expect(screen.getByTestId('passage-preview-text')).toBeTruthy();

  await act(() => {
    props().onLocationChange?.(1, { start: { href: 'c2.xhtml', cfi: 'epubcfi(/6/4!/4/2/1:0)' } } as never, 10 as never, 0 as never);
  });

  expect(screen.queryByTestId('passage-preview-text')).toBeNull();
  expect(screen.getByText('The reader moved to another chapter, so the earlier selection was cleared.')).toBeTruthy();
  // Let the position write started by the location change settle before teardown.
  await act(async () => { await Promise.resolve(); });
});

test('the header clears the status bar inset and the engine gets the measured frame', async () => {
  await openTestDatabase();
  await render(<ReaderScreen book={makeBook()} onClose={jest.fn()} />);

  expect(screen.getByTestId('reader-header')).toHaveStyle({ paddingTop: 128 });
  expect(screen.getByTestId('reader-frame')).toHaveStyle({ flex: 1, minHeight: 0, overflow: 'hidden' });
  expect(latestReaderProps()).toBeNull();

  await measureFrame();

  expect(latestReaderProps()).toMatchObject({ width: 400, height: 600, allowScriptedContent: false });
});

test('scroll relocations are coalesced into one position write', async () => {
  jest.useFakeTimers();
  const db = await openTestDatabase();
  const book = makeBook();
  await render(<ReaderScreen book={book} onClose={jest.fn()} />);
  await measureFrame();
  await engineReady();

  await act(() => {
    relocate('epubcfi(/6/4!/4/2/1:0)');
    relocate('epubcfi(/6/4!/4/2/1:5)');
    relocate('epubcfi(/6/4!/4/2/1:9)');
  });

  expect(positionWrites(db)).toHaveLength(0);
  await act(() => jest.advanceTimersByTimeAsync(750));
  expect(positionWrites(db)).toHaveLength(1);
  expect(await loadLastReadingPosition(db, book.id)).toMatchObject({ cfi: 'epubcfi(/6/4!/4/2/1:9)' });
});

test('backgrounding the app and closing the reader write the pending position', async () => {
  jest.useFakeTimers();
  const db = await openTestDatabase();
  const handlers: ((state: string) => void)[] = [];
  jest.spyOn(AppState, 'addEventListener').mockImplementation(((_type: string, handler: (state: string) => void) => {
    handlers.push(handler);
    return { remove: jest.fn() };
  }) as never);
  const onClose = jest.fn();

  await render(<ReaderScreen book={makeBook()} onClose={onClose} />);
  await measureFrame();
  await engineReady();

  await act(() => { relocate('epubcfi(/6/4!/4/2/1:7)'); });
  expect(positionWrites(db)).toHaveLength(0);
  await act(async () => {
    handlers.forEach(handler => handler('background'));
    await jest.advanceTimersByTimeAsync(0);
  });
  expect(positionWrites(db)).toHaveLength(1);

  await act(() => { relocate('epubcfi(/6/4!/4/2/1:3)'); });
  expect(positionWrites(db)).toHaveLength(1);
  await fireEvent.press(screen.getByTestId('reader-back'));
  await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  expect(positionWrites(db)).toHaveLength(2);
});
