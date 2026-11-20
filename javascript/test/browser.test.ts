import { describe, it, expect, beforeAll } from 'vitest';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Canonical expected values, committed to the repository and generated from the
// JavaScript SDK by scripts/generate-qr-vectors.mjs. Tests only read this file;
// they never regenerate it, so an encoder regression fails a test instead of
// silently updating the expectations.
interface QrBatch {
  id: string;
  batchId: string;
  category: string;
}
interface QrLabel {
  id: string;
  batch: string;
  batchId: string;
  index: number;
  varintBytes: number;
  base36Code: string;
  base64Code: string;
  tags: string[];
}
interface QrStrictRejection {
  id: string;
  batch: string;
  batchId: string;
  index: number;
  base36Code: string;
  base64Code: string;
}
interface QrCustomDomain {
  id: string;
  label: string;
  domain: string;
  base36Url: string;
  base64Url: string;
}
interface QrInvalidInput {
  id: string;
  input: string;
}
interface QrVectors {
  schemaVersion: number;
  canonicalImplementation: string;
  defaultDomain: string;
  batches: QrBatch[];
  labels: QrLabel[];
  strictRejections: QrStrictRejection[];
  customDomain: QrCustomDomain[];
  invalidInputs: QrInvalidInput[];
}

const qrVectors: QrVectors = JSON.parse(
  readFileSync(resolve(__dirname, '../../test-vectors/qr-vectors.json'), 'utf-8'),
);
const qrBase36Url = (domain: string, code: string): string => `HTTPS://${domain.toUpperCase()}/${code}`;
const qrBase64Url = (domain: string, code: string): string => `https://${domain}/${code}`;

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
  // (12-byte batch + LEB128 index, big-endian base36). JavaScript is the
  // canonical QR implementation; the cross-language expected outputs are the
  // committed fixture test-vectors/qr-vectors.json. These match the Test
  // Vectors table in README.md.
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
  // derived independently (12-byte batch + LEB128 index); JavaScript is the
  // canonical QR implementation, so they are not checked against another SDK.
  // Decoding uses strict mode (known prefix required).
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

  // Golden vectors at the varint byte-length boundaries (1 -> 2 -> 3 -> 4 bytes).
  // Generated with the SDK's own encoder (getShortUrl) for batch
  // abcdef012345670000027190 on the default domain 1a4.com, and cross-checked against an independent
  // big-endian Base36 / URL-safe Base64 calculation. The Base64 codes for 248, 249,
  // 16383 and 2097151 contain '-' or '_' (URL-safe Base64's replacements for '+' and '/').
  const boundaryVectors = [
    { index: 1, bytes: 1, base36: 'HTTPS://1A4.COM/10NOIEYKAJDG6CF0EXGJL', base64: 'https://1a4.com/q83vASNFZwAAAnGQAQ' },
    { index: 127, bytes: 1, base36: 'HTTPS://1A4.COM/10NOIEYKAJDG6CF0EXGN3', base64: 'https://1a4.com/q83vASNFZwAAAnGQfw' },
    { index: 128, bytes: 2, base36: 'HTTPS://1A4.COM/78OEAYDSAXRN14AQY5YCCH', base64: 'https://1a4.com/q83vASNFZwAAAnGQgAE' },
    { index: 248, bytes: 2, base36: 'HTTPS://1A4.COM/78OEAYDSAXRN14AQY5Z01T', base64: 'https://1a4.com/q83vASNFZwAAAnGQ-AE' },
    { index: 249, bytes: 2, base36: 'HTTPS://1A4.COM/78OEAYDSAXRN14AQY5Z08X', base64: 'https://1a4.com/q83vASNFZwAAAnGQ-QE' },
    { index: 16383, bytes: 2, base36: 'HTTPS://1A4.COM/78OEAYDSAXRN14AQY5Z1J3', base64: 'https://1a4.com/q83vASNFZwAAAnGQ_38' },
    { index: 16384, bytes: 3, base36: 'HTTPS://1A4.COM/1FHPHPWI19S4JRYKFMYC8HS1', base64: 'https://1a4.com/q83vASNFZwAAAnGQgIAB' },
    { index: 2097151, bytes: 3, base36: 'HTTPS://1A4.COM/1FHPHPWI19S4JRYKFMYH7L33', base64: 'https://1a4.com/q83vASNFZwAAAnGQ__9_' },
    { index: 2097152, bytes: 4, base36: 'HTTPS://1A4.COM/A65XA07491K0CMTTB7870F4E9', base64: 'https://1a4.com/q83vASNFZwAAAnGQgICAAQ' },
  ];

  describe('Varint boundary golden vectors', () => {
    const batch = 'abcdef012345670000027190';

    boundaryVectors.forEach(({ index, bytes, base36, base64 }) => {
      it(`should decode Base36 index ${index} (${bytes}-byte varint)`, () => {
        const pair = new RetailId.RetailIdPair(base36);
        expect(pair.batchId.toHexString()).toBe(batch);
        expect(pair.index).toBe(index);
      });

      it(`should decode Base64 index ${index} (${bytes}-byte varint)`, () => {
        const pair = new RetailId.RetailIdPair(base64);
        expect(pair.batchId.toHexString()).toBe(batch);
        expect(pair.index).toBe(index);
      });

      it(`should encode index ${index} to the exact Base36 and Base64 URLs`, () => {
        const batchId = new RetailId.ObjectId(batch);
        expect(RetailId.getShortUrl(batchId, index)).toBe(base36);
        expect(RetailId.getShortUrl(batchId, index, { base64: true })).toBe(base64);
      });
    });
  });

  describe('URL-safe Base64 codes containing "_" and "-"', () => {
    // Known-prefix batch (1a4...), decoded in strict mode, as production labels are.
    const prefixBatch = '1a4060300020081000006609';
    const cases = [
      { index: 248, url: 'https://1a4.com/GkBgMAAgCBAAAGYJ-AE', char: '-' },
      { index: 249, url: 'https://1a4.com/GkBgMAAgCBAAAGYJ-QE', char: '-' },
      { index: 16383, url: 'https://1a4.com/GkBgMAAgCBAAAGYJ_38', char: '_' },
      { index: 2097151, url: 'https://1a4.com/GkBgMAAgCBAAAGYJ__9_', char: '_' },
    ];

    cases.forEach(({ index, url, char }) => {
      it(`should decode index ${index} ("${char}") in strict and default mode, and round-trip`, () => {
        expect(url.split('/').pop()).toContain(char);
        for (const strict of [true, false]) {
          const pair = new RetailId.RetailIdPair(url, strict);
          expect(pair.batchId.toHexString()).toBe(prefixBatch);
          expect(pair.index).toBe(index);
          expect(pair.encode({ base64: true })).toBe(url);
        }
      });

      it(`should decode the bare short code for index ${index} ("${char}")`, () => {
        const pair = new RetailId.RetailIdPair(url.split('/').pop());
        expect(pair.batchId.toHexString()).toBe(prefixBatch);
        expect(pair.index).toBe(index);
      });
    });
  });

  describe('Invalid input and strict-mode validation', () => {
    // Batch ffffffffffffffffffffffff has no RetailID prefix and an invalid ObjectId
    // timestamp. Its Base64 code (________________AQ) contains only '_' and URL-safe characters.
    const noPrefixBase36 = 'HTTPS://1A4.COM/1IMEU2DGGAAXHSNBHYV41';
    const noPrefixBase64 = 'https://1a4.com/________________AQ';
    // Batch 507f1f77bcf86cd799439011 has no RetailID prefix but a valid timestamp.
    const mongoBase36 = 'HTTPS://1A4.COM/H6BG9PEO99FH0S8ZWK5D';
    const mongoBase64 = 'https://1a4.com/UH8fd7z4bNeZQ5ARAQ';

    it('should reject unrecognizable input with "Unrecognized URL"', () => {
      for (const input of ['invalid_garbage', 'invalid-garbage', 'https://1a4.com/!!!', 'not a url at all']) {
        expect(() => new RetailId.RetailIdPair(input)).toThrow(/Unrecognized URL/);
      }
    });

    it('should still report a URL with no short code', () => {
      expect(() => new RetailId.RetailIdPair('https://1a4.com/')).toThrow(/no id in url/);
    });

    it('strict mode should reject an unknown prefix with an invalid timestamp (Base36 and Base64)', () => {
      expect(() => new RetailId.RetailIdPair(noPrefixBase36, true)).toThrow(/Unrecognized URL/);
      expect(() => new RetailId.RetailIdPair(noPrefixBase64, true)).toThrow(/Unrecognized URL/);
    });

    it('default mode should still accept an unknown prefix (Base36 and Base64)', () => {
      for (const url of [noPrefixBase36, noPrefixBase64]) {
        const pair = new RetailId.RetailIdPair(url);
        expect(pair.batchId.toHexString()).toBe('ffffffffffffffffffffffff');
        expect(pair.index).toBe(1);
      }
    });

    it('strict mode should still accept an unknown prefix with a valid timestamp (Base36 and Base64)', () => {
      for (const url of [mongoBase36, mongoBase64]) {
        const pair = new RetailId.RetailIdPair(url, true);
        expect(pair.batchId.toHexString()).toBe('507f1f77bcf86cd799439011');
        expect(pair.index).toBe(1);
      }
    });
  });

  describe('Canonical QR vectors (test-vectors/qr-vectors.json)', () => {
    const { defaultDomain } = qrVectors;
    const batchHex = (pair: any): string => pair.batchId.toHexString().toLowerCase();
    const varintWidth = (index: number): number => (index < 128 ? 1 : index < 16384 ? 2 : index < 2097152 ? 3 : index < 268435456 ? 4 : 5);

    it('should identify JavaScript as canonical and use the SDK default domain', () => {
      expect(qrVectors.schemaVersion).toBe(1);
      expect(qrVectors.canonicalImplementation).toBe('javascript');
      expect(defaultDomain).toBe('1a4.com');
    });

    it('should be well-formed: unique ids, lowercase batch IDs, no duplicates, indexes below 2^31', () => {
      const entries = [...qrVectors.labels, ...qrVectors.strictRejections];
      const ids = [...entries, ...qrVectors.invalidInputs].map((entry) => entry.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(new Set(entries.map((e) => `${e.batchId}:${e.index}`)).size).toBe(entries.length);
      expect(new Set(entries.flatMap((e) => [e.base36Code, e.base64Code])).size).toBe(entries.length * 2);
      const batchIdByName = new Map(qrVectors.batches.map((batch) => [batch.id, batch.batchId]));
      for (const entry of entries) {
        expect(entry.batchId, entry.id).toBe(batchIdByName.get(entry.batch));
        expect(entry.batchId, entry.id).toMatch(/^[0-9a-f]{24}$/);
        expect(Number.isInteger(entry.index), entry.id).toBe(true);
        expect(entry.index, entry.id).toBeGreaterThanOrEqual(0);
        expect(entry.index, entry.id).toBeLessThan(2 ** 31);
      }
      for (const label of qrVectors.labels) {
        expect(label.varintBytes, label.id).toBe(varintWidth(label.index));
      }
    });

    it('should cover every requested varint boundary for each known-prefix batch, plus "-" and "_" codes', () => {
      const required = [0, 1, 127, 128, 248, 249, 16383, 16384, 2097151, 2097152];
      const prefixBatches = qrVectors.batches.filter((batch) => batch.category === 'known-prefix');
      expect(prefixBatches.length).toBeGreaterThanOrEqual(2);
      for (const batch of prefixBatches) {
        const indexes = qrVectors.labels.filter((label) => label.batch === batch.id).map((label) => label.index);
        expect(indexes, batch.id).toEqual(expect.arrayContaining(required));
      }
      expect(qrVectors.labels.some((label) => label.base64Code.includes('-'))).toBe(true);
      expect(qrVectors.labels.some((label) => label.base64Code.includes('_'))).toBe(true);
      for (const label of qrVectors.labels) {
        expect(label.tags.includes('base64-hyphen'), label.id).toBe(label.base64Code.includes('-'));
        expect(label.tags.includes('base64-underscore'), label.id).toBe(label.base64Code.includes('_'));
      }
    });

    qrVectors.labels.forEach((label) => {
      it(`${label.id}: should encode to the expected Base36 and Base64 URLs`, () => {
        const batchId = new RetailId.ObjectId(label.batchId);
        expect(RetailId.getShortUrl(batchId, label.index)).toBe(qrBase36Url(defaultDomain, label.base36Code));
        expect(RetailId.getShortUrl(batchId, label.index, { base64: true })).toBe(qrBase64Url(defaultDomain, label.base64Code));
      });

      it(`${label.id}: should decode both encodings in default and strict mode`, () => {
        const inputs = [
          qrBase36Url(defaultDomain, label.base36Code),
          qrBase64Url(defaultDomain, label.base64Code),
          label.base36Code,
          label.base64Code,
        ];
        for (const strict of [false, true]) {
          for (const input of inputs) {
            const context = `${label.id} ${input} strict=${strict}`;
            const pair = new RetailId.RetailIdPair(input, strict);
            expect(batchHex(pair), context).toBe(label.batchId);
            expect(pair.index, context).toBe(label.index);
          }
        }
      });
    });

    qrVectors.customDomain.forEach((vector) => {
      it(`${vector.id}: should encode with a custom domain and decode back to the same label`, () => {
        const label = qrVectors.labels.find((candidate) => candidate.id === vector.label);
        expect(label, vector.label).toBeDefined();
        const batchId = new RetailId.ObjectId(label!.batchId);
        expect(RetailId.getShortUrl(batchId, label!.index, { domain: vector.domain })).toBe(vector.base36Url);
        expect(RetailId.getShortUrl(batchId, label!.index, { domain: vector.domain, base64: true })).toBe(vector.base64Url);
        for (const url of [vector.base36Url, vector.base64Url]) {
          const pair = new RetailId.RetailIdPair(url);
          expect(batchHex(pair), url).toBe(label!.batchId);
          expect(pair.index, url).toBe(label!.index);
        }
      });
    });

    qrVectors.strictRejections.forEach((vector) => {
      it(`${vector.id}: strict mode should reject an unknown prefix with an invalid timestamp`, () => {
        const inputs = [
          qrBase36Url(defaultDomain, vector.base36Code),
          qrBase64Url(defaultDomain, vector.base64Code),
          vector.base36Code,
          vector.base64Code,
        ];
        for (const input of inputs) {
          expect(() => new RetailId.RetailIdPair(input, true), `${vector.id} ${input}`).toThrow(/Unrecognized URL/);
        }
      });
    });

    qrVectors.invalidInputs.forEach((vector) => {
      it(`${vector.id}: should reject '${vector.input}' in default and strict mode`, () => {
        for (const strict of [false, true]) {
          expect(() => new RetailId.RetailIdPair(vector.input, strict), `${vector.id} strict=${strict}`).toThrow(/Unrecognized URL/);
        }
      });
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
