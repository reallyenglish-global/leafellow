// SPDX-License-Identifier: Apache-2.0
import { Directory, File, Paths } from 'expo-file-system';

import {
  RENDERER_SOURCE_DIRECTORY,
  RendererSourcePartialWriteError,
  createRendererSourceStore,
  type RendererSourceFileSystem,
} from '../../../src/reader/renderer-source';

// App cache only: not the document directory (where the renderer writes its own index.html and
// scripts), not shared, and not something the OS promises to keep or back up.
function ownedDirectory(): Directory {
  return new Directory(Paths.cache, RENDERER_SOURCE_DIRECTORY);
}

export const expoRendererSourceFileSystem: RendererSourceFileSystem = {
  async writeNew(name, bytes) {
    const directory = ownedDirectory();
    directory.create({ idempotent: true, intermediates: true });
    const file = new File(directory, name);
    file.create();
    try {
      await file.write(bytes);
    } catch {
      throw new RendererSourcePartialWriteError();
    }
    return file.uri;
  },
  delete(name) {
    const file = new File(ownedDirectory(), name);
    if (file.exists) file.delete();
  },
  list() {
    const directory = ownedDirectory();
    if (!directory.exists) return [];
    return directory.list().filter(entry => entry instanceof File).map(entry => entry.name);
  },
};

function rendererSourceToken(): string {
  return `${Date.now().toString(36)}${Math.floor(Math.random() * 0x100000000).toString(36)}`;
}

export function createAppRendererSources() {
  return createRendererSourceStore(expoRendererSourceFileSystem, rendererSourceToken);
}
