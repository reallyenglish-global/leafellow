// SPDX-License-Identifier: Apache-2.0
//
// The EPUB renderer (@epubjs-react-native/core 1.4.8) loads a local book by handing its src string
// to epub.js inside the WebView. Android's picker returns a SAF content:// URI, which that WebView
// path cannot read (and, without ".epub" in it, core rejects outright). So on such platforms the
// exact bytes already validated by inspectEpub are written to an app-owned cache file and the
// renderer gets that file:// URI. The copy is temporary: it exists only while the book is open
// and is removed on close; copies left behind by a crash are removed on the next start.

/** Subdirectory of the app cache that only this module writes to. */
export const RENDERER_SOURCE_DIRECTORY = 'leafellow-reader-source';

const OWNED_NAME = /^book-[a-z0-9]{8,64}\.epub$/;

export function isOwnedRendererSourceName(name: string): boolean {
  return OWNED_NAME.test(name);
}

/**
 * Whether the renderer can load this URI directly: a local file:/// path that core classifies as an
 * EPUB (it guesses from ".epub" in the string; over 1000 characters it assumes inline base64).
 */
export function rendererCanLoadUri(uri: string): boolean {
  return uri.startsWith('file:///') && uri.length <= 1000 && !uri.includes('base64,')
    && uri.endsWith('.epub') && !/[\\'"<>\u0000-\u001f\u2028\u2029]/.test(uri);
}

/** Filesystem operations, scoped to the owned cache directory; names never contain separators. */
export interface RendererSourceFileSystem {
  /** Creates a new file (failing if it exists), writes the bytes and returns its file:/// URI. */
  writeNew(name: string, bytes: Uint8Array): Promise<string>;
  /** Deletes the named file; may throw. */
  delete(name: string): void;
  /** Names of files currently in the owned directory; may throw if it is missing. */
  list(): string[];
}

export interface RendererSource {
  uri: string;
  /** True when the renderer reads an app-owned temporary copy rather than the picked file. */
  copied: boolean;
  /** Removes this source's own temporary copy, if any. Idempotent and never throws. */
  release(): void;
}

/** The adapter may report this only after exclusive creation succeeded, so cleanup is owned. */
export class RendererSourcePartialWriteError extends Error {
  constructor() { super('Temporary reading copy write failed.'); }
}

export class RendererSourceError extends Error {
  constructor() {
    super('The book could not be prepared for reading on this device.');
    this.name = 'RendererSourceError';
  }
}

export function createRendererSourceStore(fs: RendererSourceFileSystem, newToken: () => string) {
  const live = new Set<string>();

  function remove(name: string): boolean {
    try {
      fs.delete(name);
      return true;
    } catch {
      return false;
    }
  }

  async function prepare(pickedUri: string, validatedBytes: Uint8Array): Promise<RendererSource> {
    if (rendererCanLoadUri(pickedUri)) return { uri: pickedUri, copied: false, release() {} };
    const name = `book-${newToken()}.epub`;
    if (!isOwnedRendererSourceName(name) || live.has(name)) throw new RendererSourceError();
    live.add(name);
    let uri: string;
    let created = false;
    try {
      uri = await fs.writeNew(name, validatedBytes);
      created = true;
      if (!rendererCanLoadUri(uri) || !uri.endsWith(`/${name}`)) throw new RendererSourceError();
    } catch (error) {
      // A failed exclusive create may mean this name belongs to an earlier session. Only remove
      // a file after confirmed creation or an adapter-confirmed partial write owned by this call.
      if (created || error instanceof RendererSourcePartialWriteError) remove(name);
      live.delete(name);
      throw new RendererSourceError();
    }
    let released = false;
    return {
      uri,
      copied: true,
      release() {
        if (released) return;
        released = true;
        // If deletion fails the name stays live-free, so the next startup sweep removes it.
        remove(name);
        live.delete(name);
      },
    };
  }

  /** Removes owned copies not held by a live source (crash leftovers). Returns how many it removed. */
  function sweep(): number {
    let names: string[];
    try {
      names = fs.list();
    } catch {
      return 0;
    }
    let removed = 0;
    for (const name of names) {
      if (isOwnedRendererSourceName(name) && !live.has(name) && remove(name)) removed += 1;
    }
    return removed;
  }

  return { prepare, sweep };
}

export type RendererSourceStore = ReturnType<typeof createRendererSourceStore>;
