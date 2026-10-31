import { describe, it, expect, beforeAll } from 'vitest';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('RetailId Browser Bundle', () => {
  let RetailId: any;

  beforeAll(() => {
    // Set up browser-like environment
    const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
      runScripts: 'dangerously',
    });

    // Load the built bundle
    const bundlePath = resolve(__dirname, '../dist/retailid.min.js');
    const bundleCode = readFileSync(bundlePath, 'utf-8');

    // Execute in JSDOM context
    dom.window.eval(bundleCode);
    RetailId = (dom.window as any).RetailId;
  });

  // Vectors for batch abcdef012345670000027190. Each was derived independently
  // (12-byte batch + LEB128 index, big-endian base36) and cross-checked against
  // the Python SDK. They match the Test Vectors table in README.md.
  const testCases = [
    {
      url: 'HTTPS://D.1A4.COM/10NOIEYKAJDG6CF0EXGJL',
      expectedBatchId: 'ABCDEF012345670000027190',
      expectedIndex: 1,
      description: 'index 1 (1-byte varint)',
    },
    {
      url: 'HTTPS://D.1A4.COM/78OEAYDSAXRN14AQY5YCCH',
      expectedBatchId: 'ABCDEF012345670000027190',
      expectedIndex: 128,
      description: 'index 128 (2-byte varint)',
    },
    {
      url: 'HTTPS://D.1A4.COM/1FHPHPWI19S4JRYKFMYC8HS1',
      expectedBatchId: 'ABCDEF012345670000027190',
      expectedIndex: 16384,
      description: 'index 16384 (3-byte varint)',
    },
  ];

  describe('Decoding URLs', () => {
    testCases.forEach(({ url, expectedBatchId, expectedIndex, description }) => {
      it(`should decode ${description}`, () => {
        const pair = new RetailId.RetailIdPair(url);
        expect(pair.batchId.toHexString().toLowerCase()).toBe(expectedBatchId.toLowerCase());
        expect(pair.index).toBe(expectedIndex);
      });
    });
  });

  describe('Round-trip encoding/decoding', () => {
    testCases.forEach(({ url, expectedBatchId, expectedIndex, description }) => {
      it(`should round-trip ${description}`, () => {
        // Decode
        const pair = new RetailId.RetailIdPair(url);

        // Re-encode
        const encoded = pair.encode();

        // Decode again
        const pair2 = new RetailId.RetailIdPair(encoded);

        expect(pair2.batchId.toHexString().toLowerCase()).toBe(expectedBatchId.toLowerCase());
        expect(pair2.index).toBe(expectedIndex);
      });
    });
  });

  describe('Direct encoding with getShortUrl', () => {
    it('should encode ObjectId + index to URL', () => {
      const batchId = new RetailId.ObjectId('ABCDEF012345670000027190');
      const url = RetailId.getShortUrl(batchId, 1);

      // Should produce the exact uppercase Base36 URL for this batch and index
      expect(url).toMatch(/^HTTPS:\/\/1A4\.COM\//);
      expect(url).toBe('HTTPS://1A4.COM/10NOIEYKAJDG6CF0EXGJL');

      // Should decode back correctly (toHexString() returns lowercase hex)
      const pair = new RetailId.RetailIdPair(url);
      expect(pair.batchId.toHexString()).toBe('abcdef012345670000027190');
      expect(pair.index).toBe(1);
    });
  });

  describe('Legacy Base64 URL decoding', () => {
    // Legacy URL-safe Base64 vector for batch abcdef012345670000027190, index 17
    // (independently derived; matches the Test Vectors table in README.md).
    const legacyUrl = 'https://d.1a4.com/q83vASNFZwAAAnGQEQ';

    it('should decode legacy base64 URL', () => {
      const pair = new RetailId.RetailIdPair(legacyUrl);
      expect(pair.batchId.toHexString()).toBe('abcdef012345670000027190');
      expect(pair.index).toBe(17);
    });

    it('should round-trip legacy base64 URL via base64 encoding', () => {
      const pair = new RetailId.RetailIdPair(legacyUrl);

      // Re-encode as base64 (default domain)
      const encoded = pair.encode({ base64: true });
      expect(encoded).toBe('https://1a4.com/q83vASNFZwAAAnGQEQ');

      // Decode again
      const pair2 = new RetailId.RetailIdPair(encoded);
      expect(pair2.batchId.toHexString()).toBe('abcdef012345670000027190');
      expect(pair2.index).toBe(17);
    });

    it('should round-trip legacy base64 URL via base36 encoding (default)', () => {
      const pair = new RetailId.RetailIdPair(legacyUrl);

      // Re-encode as base36 (default)
      const encoded = pair.encode();

      // Should be uppercase base36, exactly
      expect(encoded).toMatch(/^HTTPS:\/\/1A4\.COM\/[A-Z0-9]+$/);
      expect(encoded).toBe('HTTPS://1A4.COM/10NOIEYKAJDG6CF0EXGK1');

      // Decode again
      const pair2 = new RetailId.RetailIdPair(encoded);
      expect(pair2.batchId.toHexString()).toBe('abcdef012345670000027190');
      expect(pair2.index).toBe(17);
    });
  });

  // Production-prefix vectors: batch IDs starting with the known RetailID prefix
  // "1a4". These are the original URLs from earlier versions of this suite, now
  // asserted against their actual decoded batch IDs and indexes. Each value was
  // derived independently (12-byte batch + LEB128 index) and cross-checked
  // against the Python SDK. Decoding uses strict mode (known prefix required).
  describe('Production-prefix (1a4) vectors', () => {
    it('should decode Base36 index 128 and re-encode to the identical URL', () => {
      const url = 'HTTPS://1A4.COM/13TX7BMRX3IU01B9EGTPTT';
      const pair = new RetailId.RetailIdPair(url, true);
      expect(pair.batchId.toHexString()).toBe('1a4060300020081000006609');
      expect(pair.index).toBe(128);
      expect(pair.encode()).toBe(url);
    });

    it('should decode Base36 index 16384 and re-encode to the identical URL', () => {
      const url = 'HTTPS://1A4.COM/7V8S42PYJD1XC9C2UVNCD1D';
      const pair = new RetailId.RetailIdPair(url, true);
      expect(pair.batchId.toHexString()).toBe('1a4060300020081000006609');
      expect(pair.index).toBe(16384);
      expect(pair.encode()).toBe(url);
    });

    it('should decode legacy Base64 index 17 and re-encode to the identical URL', () => {
      const url = 'https://1a4.com/GkBgMAAEG2AAAJKXEQ';
      const pair = new RetailId.RetailIdPair(url, true);
      expect(pair.batchId.toHexString()).toBe('1a40603000041b6000009297');
      expect(pair.index).toBe(17);
      expect(pair.encode({ base64: true })).toBe(url);
    });

    it('should re-encode the legacy Base64 label as its exact Base36 equivalent', () => {
      const pair = new RetailId.RetailIdPair('https://1a4.com/GkBgMAAEG2AAAJKXEQ', true);
      const base36 = pair.encode();
      expect(base36).toBe('HTTPS://1A4.COM/5LN8CBN1F0QEADZAUAKX');

      const pair2 = new RetailId.RetailIdPair(base36, true);
      expect(pair2.batchId.toHexString()).toBe('1a40603000041b6000009297');
      expect(pair2.index).toBe(17);
    });
  });

  describe('Encoder defaults to base36', () => {
    it('should produce base36 URL by default', () => {
      const batchId = new RetailId.ObjectId('ABCDEF012345670000027190');
      const url = RetailId.getShortUrl(batchId, 1);

      // Should be uppercase base36 format
      expect(url).toMatch(/^HTTPS:\/\/1A4\.COM\/[A-Z0-9]+$/);
    });

    it('should produce base64 URL only when explicitly requested', () => {
      const batchId = new RetailId.ObjectId('ABCDEF012345670000027190');
      const url = RetailId.getShortUrl(batchId, 1, { base64: true });

      // Should be lowercase https with URL-safe base64
      expect(url).toMatch(/^https:\/\/1a4\.com\//);
      // URL-safe base64 should not contain +, /, or =
      const dataPart = url.split('/').pop();
      expect(dataPart).not.toMatch(/[+/=]/);
    });
  });

  describe('VarInt encoding', () => {
    it('should encode/decode small values (< 128)', () => {
      const encoded = RetailId.VarInt.encode(1);
      expect(encoded.length).toBe(1);
      const decoded = RetailId.VarInt.decode(encoded);
      expect(decoded.value).toBe(1);
    });

    it('should encode/decode values >= 128', () => {
      const encoded = RetailId.VarInt.encode(128);
      expect(encoded.length).toBe(2);
      const decoded = RetailId.VarInt.decode(encoded);
      expect(decoded.value).toBe(128);
    });

    it('should encode/decode values >= 16384', () => {
      const encoded = RetailId.VarInt.encode(16384);
      expect(encoded.length).toBe(3);
      const decoded = RetailId.VarInt.decode(encoded);
      expect(decoded.value).toBe(16384);
    });
  });
});
