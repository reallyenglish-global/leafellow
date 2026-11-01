// SPDX-License-Identifier: Apache-2.0
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { unzipSync, strFromU8 } from 'fflate';
import { XMLParser, XMLValidator } from 'fast-xml-parser';

import { ImportError } from '../document-import-error.ts';
import type { ImportedDocument, TextPart } from '../document-types.ts';

const MAX_DOCUMENT_BYTES = 2 * 1024 * 1024;

type ManifestItem = { '@_id': string; '@_href': string; '@_media-type': string; '@_properties'?: string };
type Meta = { '@_property'?: string; '#text'?: string };
type ItemRef = { '@_idref': string };

const xmlOptions = { ignoreAttributes: false, removeNSPrefix: true, trimValues: false, parseTagValue: false, htmlEntities: true };
const xml = new XMLParser(xmlOptions);
const orderedXml = new XMLParser({ ...xmlOptions, preserveOrder: true });

function list<T>(value: T | T[]): T[] {
  return Array.isArray(value) ? value : [value];
}

function bodyText(value: unknown): string {
  if (!Array.isArray(value)) return '';
  return value.map(node => {
    if (!node || typeof node !== 'object') return '';
    return Object.entries(node).map(([tag, children]) => {
      if (tag === '#text') return String(children);
      if (['head', 'style', ':@'].includes(tag)) return '';
      const text = bodyText(children);
      return ['p', 'div', 'br', 'li', 'h1', 'h2', 'h3'].includes(tag) ? ` ${text} ` : text;
    }).join('');
  }).join('');
}

function safePath(value: string): string {
  let path: string;
  try { path = decodeURIComponent(value); } catch { throw new ImportError('Unsafe EPUB path'); }
  if (!path || /[\\:?#%\0]/.test(path) || path.split('/').some(part => !part || part === '.' || part === '..')) {
    throw new ImportError('Unsafe EPUB path');
  }
  return path;
}

function checkXml(text: string): void {
  // A bare HTML5 doctype is inert; reject external or internal DTD/entity declarations.
  const withoutHtml5Doctype = text.replace(/<!DOCTYPE\s+html\s*>/gi, '');
  if (/<!DOCTYPE|<!ENTITY/i.test(withoutHtml5Doctype)) throw new ImportError('XML declarations are unsupported');
  if (/<(?:[\w.-]+:)?(?:script|iframe|object|embed)\b|\son[\w-]+\s*=/i.test(withoutHtml5Doctype)) {
    throw new ImportError('Active EPUB content');
  }
  if (XMLValidator.validate(withoutHtml5Doctype) !== true) throw new ImportError('Invalid EPUB XML');
}

function epubParts(bytes: Uint8Array): TextPart[] {
  let total = 0;
  const entries = new Set<string>();
  // Metadata-only pass: reject limits before allocating decompressed resources.
  unzipSync(bytes, { filter: entry => {
    safePath(entry.name.replace(/\/$/, ''));
    total += entry.originalSize;
    if (entries.has(entry.name) || entries.size >= 128 || entry.originalSize > 512 * 1024 || total > 4 * 1024 * 1024) {
      throw new ImportError('EPUB resource limit');
    }
    entries.add(entry.name);
    return false;
  } });
  const files = unzipSync(bytes);
  if (files['META-INF/encryption.xml']) throw new ImportError('Protected EPUB');
  const read = (name: string): string => {
    const data = files[name];
    if (!data) throw new Error('Missing EPUB resource');
    const text = strFromU8(data);
    if (name !== 'mimetype') checkXml(text);
    return text;
  };
  if (read('mimetype') !== 'application/epub+zip') throw new Error('Invalid EPUB mimetype');
  const container = xml.parse(read('META-INF/container.xml')) as {
    container: { rootfiles: { rootfile: { '@_full-path': string } } };
  };
  const packagePath = safePath(container.container.rootfiles.rootfile['@_full-path']);
  const packageXml = read(packagePath);
  const opf = xml.parse(packageXml) as {
    package: { metadata?: { meta?: Meta | Meta[] }; manifest: { item: ManifestItem | ManifestItem[] }; spine: { itemref: ItemRef | ItemRef[] } };
  };
  const items = list(opf.package.manifest.item);
  const properties = items.flatMap(item => (item['@_properties'] ?? '').split(/\s+/));
  if (properties.includes('scripted')) throw new ImportError('Active EPUB content');
  if (properties.includes('rendition:layout-pre-paginated') ||
      list(opf.package.metadata?.meta ?? []).some(meta => meta['@_property'] === 'rendition:layout' && meta['#text']?.trim() === 'pre-paginated')) {
    throw new ImportError('Fixed-layout EPUB');
  }
  const manifest = new Map(items.map(item => [item['@_id'], item]));
  if (manifest.size !== items.length || items.some(item => typeof item['@_id'] !== 'string' || !item['@_id'])) {
    throw new ImportError('Invalid EPUB manifest');
  }
  const base = packagePath.slice(0, packagePath.lastIndexOf('/') + 1);
  const refs = list(opf.package.spine.itemref);
  if (refs.length === 0 || refs.length > 100) throw new ImportError('EPUB spine limit');
  let totalText = 0;
  return refs.map(ref => {
    const item = manifest.get(ref['@_idref']);
    if (!item) throw new Error('Missing EPUB spine item');
    if (item['@_media-type'] !== 'application/xhtml+xml') throw new ImportError('Unsupported EPUB media');
    const href = safePath(base + safePath(item['@_href']));
    const text = bodyText(orderedXml.parse(read(href))).replace(/\s+/g, ' ').trim();
    totalText += text.length;
    if (text.length > 100000 || totalText > 500000) throw new ImportError('Document text limit');
    return { location: { format: 'epub', href }, text, textStatus: text ? 'available' : 'unavailable' };
  });
}

export function importEpubDocument(bytes: Uint8Array): ImportedDocument {
  if (!(bytes instanceof Uint8Array)) throw new TypeError('Expected Uint8Array');
  if (bytes.byteLength > MAX_DOCUMENT_BYTES) throw new ImportError('Document byte limit');
  const data = new Uint8Array(bytes);
  const isZip = data[0] === 80 && data[1] === 75 && data[2] === 3 && data[3] === 4;
  if (!isZip) throw new ImportError('Unsupported document');
  const id = `sha256:${bytesToHex(sha256(data))}`;
  try {
    return { id, extractionVersion: 1, format: 'epub', parts: epubParts(data) };
  } catch (error) {
    if (error instanceof ImportError) throw error;
    throw new ImportError('Invalid EPUB');
  }
}
