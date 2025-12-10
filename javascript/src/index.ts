"use strict";

// Minimal ObjectId implementation for browser
export class ObjectId {
  private bytes: Uint8Array;

  constructor(input?: string | Uint8Array) {
    if (input === undefined) {
      // Generate new ObjectId (12 random bytes)
      this.bytes = new Uint8Array(12);
      crypto.getRandomValues(this.bytes);
    } else if (typeof input === 'string') {
      if (input.length !== 24 || !/^[0-9a-fA-F]+$/.test(input)) {
        throw new Error(`Invalid ObjectId hex string: ${input}`);
      }
      this.bytes = hexToBytes(input);
    } else if (input instanceof Uint8Array) {
      if (input.length !== 12) {
        throw new Error(`Invalid ObjectId bytes length: ${input.length}`);
      }
      this.bytes = input;
    } else {
      throw new Error('ObjectId must be a 24-char hex string or 12-byte Uint8Array');
    }
  }

  get id(): Uint8Array {
    return this.bytes;
  }

  toHexString(): string {
    return bytesToHex(this.bytes);
  }

  toString(): string {
    return this.toHexString();
  }

  equals(other: ObjectId | Uint8Array): boolean {
    const otherBytes = other instanceof ObjectId ? other.bytes : other;
    if (this.bytes.length !== otherBytes.length) return false;
    for (let i = 0; i < this.bytes.length; i++) {
      if (this.bytes[i] !== otherBytes[i]) return false;
    }
    return true;
  }
}

// Hex conversion utilities
function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}

// Varint encoding/decoding (inlined, no dependency)
function varintEncode(num: number): Uint8Array {
  const bytes: number[] = [];
  while (num >= 0x80) {
    bytes.push((num & 0x7f) | 0x80);
    num >>>= 7;
  }
  bytes.push(num);
  return new Uint8Array(bytes);
}

function varintDecode(bytes: Uint8Array, offset = 0): { value: number; length: number } {
  let value = 0;
  let shift = 0;
  let length = 0;
  while (true) {
    if (offset + length >= bytes.length) {
      throw new Error('Varint decode: buffer underflow');
    }
    const byte = bytes[offset + length];
    value |= (byte & 0x7f) << shift;
    length++;
    if ((byte & 0x80) === 0) break;
    shift += 7;
  }
  return { value, length };
}

// Base36 encoding/decoding
function bigIntToBase36(num: bigint): string {
  return num.toString(36).toUpperCase();
}

function base36ToBigInt(str: string): bigint {
  return [...str.toLowerCase()].reduce(
    (acc, curr) => BigInt(parseInt(curr, 36)) + 36n * acc,
    0n
  );
}

function bigIntToBytes(bn: bigint): Uint8Array {
  let hex = bn.toString(16);
  if (hex.length % 2) hex = '0' + hex;
  const len = hex.length / 2;
  const u8 = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    u8[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return u8;
}

function bytesToBigInt(buf: Uint8Array): bigint {
  let hex = '';
  for (let i = 0; i < buf.length; i++) {
    hex += buf[i].toString(16).padStart(2, '0');
  }
  return BigInt('0x' + hex);
}

export const encodeBase36 = (buf: Uint8Array): string => bigIntToBase36(bytesToBigInt(buf));
export const decodeBase36 = (base36: string): Uint8Array => bigIntToBytes(base36ToBigInt(base36));
export const testBase36 = (base36: string): boolean => /^[A-Za-z0-9]+$/.test(base36);

// URL64 encoding/decoding
export const decodeUrl64 = (encoded: string): string => {
  encoded = encoded.replace(/-/g, '+').replace(/_/g, '/');
  while (encoded.length % 4) encoded += '=';
  return encoded;
};

export const encodeUrl64 = (base64: string): string => {
  return base64.replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
};

// VarInt class
export class VarInt {
  private bytes: Uint8Array;
  value: number;

  static decode(source: Uint8Array): { value: number; length: number; bytes: Uint8Array } {
    const { value, length } = varintDecode(source);
    const bytes = source.slice(0, length);
    return { value, length, bytes };
  }

  static encode(value: number): Uint8Array {
    return varintEncode(value);
  }

  toHexString(): string {
    return bytesToHex(this.bytes);
  }

  toString(): string {
    return '0x' + this.value.toString(16);
  }

  length(): number {
    return this.bytes.length;
  }

  data(): Uint8Array {
    return this.bytes;
  }

  constructor(source: Uint8Array | number) {
    if (typeof source === 'number') {
      this.value = source;
      this.bytes = VarInt.encode(this.value);
    } else {
      try {
        const { value, bytes } = VarInt.decode(source);
        this.value = value;
        this.bytes = bytes;
      } catch (e) {
        console.error(source, e);
        throw new Error('failed to construct VarInt');
      }
    }
  }
}

// RetailIdPair class
export class RetailIdPair {
  batchId: ObjectId;
  index: number;

  constructor(stringUrl: string, strict?: boolean) {
    const { batchId, index } = getBatchIdAndIndexFromUrl(stringUrl, strict);
    this.batchId = batchId;
    this.index = index;
  }

  encode(options?: { domain?: string; base64?: boolean }): string {
    return getShortUrl(this.batchId, this.index, options);
  }
}

// Internal helpers
function concatBytes(...arrays: Uint8Array[]): Uint8Array {
  const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

function base64ToBytes(base64: string): Uint8Array {
  let binary: string;
  try {
    binary = atob(base64);
  } catch {
    throw new Error(`Invalid base64 encoding: "${base64}"`);
  }
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

interface ParsedId {
  batchId: ObjectId;
  index: number;
}

// Known RetailID prefixes
const RETAILID_PREFIXES = ["1a4", "abc"];

// Valid ObjectId timestamp range: 2012-01-01 to 2052-01-01
const MIN_OBJECTID_TIMESTAMP = Math.floor(new Date("2012-01-01").getTime() / 1000);
const MAX_OBJECTID_TIMESTAMP = Math.floor(new Date("2052-01-01").getTime() / 1000);

const isValidObjectIdTimestamp = (bytes: Uint8Array): boolean => {
  if (bytes.length < 4) return false;
  // First 4 bytes are big-endian Unix timestamp
  const timestamp = (bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3];
  return timestamp >= MIN_OBJECTID_TIMESTAMP && timestamp <= MAX_OBJECTID_TIMESTAMP;
};

const getBatchIdAndIndex = (buffer: Uint8Array, mode: 'strict' | 'mongo' | 'any'): ParsedId => {
  if (buffer.length < 13) {
    throw new Error(`Buffer too short: expected at least 13 bytes, got ${buffer.length}`);
  }

  const idBytes = buffer.subarray(0, 12);
  const hexId = bytesToHex(idBytes);

  // Check for known RetailID prefixes
  const hasKnownPrefix = RETAILID_PREFIXES.some(prefix => hexId.startsWith(prefix));

  if (!hasKnownPrefix) {
    if (mode === 'strict') {
      throw new Error(`unknown prefix ${hexId}`);
    }
    else if (mode === 'mongo') {
      if (!isValidObjectIdTimestamp(idBytes)) {
        throw new Error(`invalid mongo timestamp ${hexId}`);
      }
    }
  }

  let batchId: ObjectId;
  try {
    batchId = new ObjectId(hexId);
  } catch (e) {
    throw new Error(`Invalid ObjectId: ${hexId}`);
  }

  const indexBuf = buffer.subarray(12);
  const res = VarInt.decode(indexBuf);

  return { batchId, index: res.value };
};

const getBatchIdAndIndexFromUrl = (url: string, strict = false): ParsedId => {
  let shortCode = url;
  if (url.toLowerCase().indexOf('http') !== -1) {
    const [, uri] = url.split('//');
    const [domain, ...paths] = uri.split('/');
    if (!paths.length) {
      throw new Error(`no paths for domain: ${domain}, full: ${url}`);
    }
    shortCode = paths[paths.length - 1];
    if (!shortCode) {
      throw new Error(`no id in url ${url}, domain: ${domain}`);
    }
  }

  // Mixed case shortcode = definitely base64, all uppercase = could be either
  const shortCodeIsAllUppercase = shortCode === shortCode.toUpperCase();

  // Decode helpers
  const decodeBase36Buf = (): Uint8Array => decodeBase36(shortCode);
  const decodeBase64Buf = (): Uint8Array => base64ToBytes(decodeUrl64(shortCode));

  // Try with a specific encoding and mode, return null on failure
  const tryParse = (buf: Uint8Array, mode: 'strict' | 'mongo' | 'any'): ParsedId | null => {
    try {
      return getBatchIdAndIndex(buf, mode);
    } catch {
      return null;
    }
  };

  // 1. Try strict mode (known prefixes only) with both encodings

  // Could be base36 - try it first
  const base36Buf = tryParse(decodeBase36Buf(), 'strict');
  if (base36Buf) return base36Buf;

  // Try base64
  const base64Strict = tryParse(decodeBase64Buf(), 'strict');
  if (base64Strict) return base64Strict;

  // 2. If allowMongo, try mongo mode (valid timestamp) with both encodings

  if (shortCodeIsAllUppercase) {
    const base36Mongo = tryParse(decodeBase36Buf(), strict ? 'mongo' : 'any');
    if (base36Mongo) return base36Mongo;
  }
  const base64Mongo = tryParse(decodeBase64Buf(), strict ? 'mongo' : 'any');
  if (base64Mongo) return base64Mongo;

  throw new Error(`Unrecognized URL: ${url}`);
};

const getBuffer = (batchId: ObjectId, index: number): Uint8Array => {
  const varintBuf = VarInt.encode(index);
  let batchBuf = batchId.id;
  if (!batchBuf) {
    if (typeof batchId === 'string') {
      batchBuf = hexToBytes(batchId as unknown as string);
    } else {
      throw new Error(`${batchId ? 'bad' : 'missing'} buffer or string: ${batchId}`);
    }
  }
  const buf = concatBytes(batchBuf, varintBuf);
  // this inline decode unit test is unnecessary overhead if we have good unit tests

  // const result = getBatchIdAndIndex(buf, 'mongo');
  // if (!result.batchId.equals(batchBuf)) throw new Error('bad batchId in encoding');
  // if (result.index !== index) {
  //   throw new Error(`bad index in encoding ${result.index} != ${index}`);
  // }
  return buf;
};

export const getShortUrl = (
  batchId: ObjectId,
  index: number,
  options?: { domain?: string; base64?: boolean }
): string => {
  const domain = options?.domain || '1a4.com';
  if (options?.base64) {
    const base64 = bytesToBase64(getBuffer(batchId, index));
    const dataPart = encodeUrl64(base64);
    return `https://${domain}/${dataPart}`;
  } else {
    const buf = getBuffer(batchId, index);
    const dataPart = encodeBase36(buf);
    return `HTTPS://${domain}/${dataPart}`.toUpperCase();
  }
};
