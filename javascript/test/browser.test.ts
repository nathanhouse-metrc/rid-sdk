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

  const testCases = [
    {
      url: 'HTTPS://D.1A4.COM/10NOIEYKAJDG6CF0EXGJL',
      expectedBatchId: 'ABCDEF012345670000027190',
      expectedIndex: 1,
      description: 'index 1 (36 chars)',
    },
    {
      url: 'HTTPS://1A4.COM/13TX7BMRX3IU01B9EGTPTT',
      expectedBatchId: 'ABCDEF012345670000027190',
      expectedIndex: 128,
      description: 'index 128 (38 chars)',
    },
    {
      url: 'HTTPS://1A4.COM/7V8S42PYJD1XC9C2UVNCD1D',
      expectedBatchId: 'ABCDEF012345670000027190',
      expectedIndex: 16384,
      description: 'index 16384 (39 chars)',
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

      // Should produce uppercase URL
      expect(url).toMatch(/^HTTPS:\/\/1A4\.COM\//);

      // Should decode back correctly
      const pair = new RetailId.RetailIdPair(url);
      expect(pair.batchId.toHexString().toLowerCase()).toBe('ABCDEF012345670000027190');
      expect(pair.index).toBe(1);
    });
  });

  describe('Legacy Base64 URL decoding', () => {
    it('should decode legacy base64 URL', () => {
      const url = 'https://1a4.com/GkBgMAAEG2AAAJKXEQ';
      const pair = new RetailId.RetailIdPair(url);
      expect(pair.batchId.toHexString().toLowerCase()).toBe('ABCDEF012345670000027190');
      expect(pair.index).toBe(17);
    });

    it('should round-trip legacy base64 URL via base64 encoding', () => {
      const url = 'https://1a4.com/GkBgMAAEG2AAAJKXEQ';
      const pair = new RetailId.RetailIdPair(url);

      // Re-encode as base64
      const encoded = pair.encode({ base64: true });

      // Decode again
      const pair2 = new RetailId.RetailIdPair(encoded);
      expect(pair2.batchId.toHexString().toLowerCase()).toBe('ABCDEF012345670000027190');
      expect(pair2.index).toBe(17);
    });

    it('should round-trip legacy base64 URL via base36 encoding (default)', () => {
      const url = 'https://1a4.com/GkBgMAAEG2AAAJKXEQ';
      const pair = new RetailId.RetailIdPair(url);

      // Re-encode as base36 (default)
      const encoded = pair.encode();

      // Should be uppercase base36
      expect(encoded).toMatch(/^HTTPS:\/\/1A4\.COM\/[A-Z0-9]+$/);

      // Decode again
      const pair2 = new RetailId.RetailIdPair(encoded);
      expect(pair2.batchId.toHexString().toLowerCase()).toBe('ABCDEF012345670000027190');
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
