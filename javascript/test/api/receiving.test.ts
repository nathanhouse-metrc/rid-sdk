import { describe, expect, it } from 'vitest';

import { RetailIdResponseError, UnprocessableError, shortCodeFromUrl } from '../../src/api/index.js';
import { LABEL, LICENSE, QR_A, QR_B, QR_C, SOURCE_LABEL, makeClient, ok, rejection } from './helpers.js';

const RECEIVE = {
  Eaches: [QR_A, QR_B, QR_C],
  SiblingTags: [LABEL],
  RequiresVerification: false,
  QrCount: 3,
  SomeNewField: 'ignored',
};

describe('receiving (Py TestReceiving / Java Receiving)', () => {
  it('RC-01 receive maps the result and keeps unknown fields in raw', async () => {
    const { client, calls } = makeClient([ok(RECEIVE)]);
    const result = await client.receive(LICENSE, LABEL);
    expect(result.eaches).toEqual([QR_A, QR_B, QR_C]);
    expect(result.siblingTags).toEqual([LABEL]);
    expect(result.requiresVerification).toBe(false);
    expect(result.qrCount).toBe(3);
    expect(result.raw['SomeNewField']).toBe('ignored');
    expect(calls[0]).toMatchObject({ method: 'GET', path: `/retailid/v2/receive/${LABEL}`, query: { licenseNumber: LICENSE } });
  });

  it.each([QR_A, 'ZScU6dsbUk98nsJEAA'])('RC-02/03 receiveByQr sends only the short code (%s)', async (value) => {
    const { client, calls } = makeClient([ok(RECEIVE)]);
    await client.receiveByQr(LICENSE, value);
    expect(calls[0]!.path).toBe('/retailid/v2/receive/qr/ZScU6dsbUk98nsJEAA');
  });

  it('RC-04 shortCodeFromUrl (Py test_short_code_from_url / Java shortCodeFromUrl)', () => {
    expect(shortCodeFromUrl(QR_A)).toBe('ZScU6dsbUk98nsJEAA');
    expect(shortCodeFromUrl('HTTPS://D.1A4.COM/10NOIEYKAJDG6CF0EXGJL')).toBe('10NOIEYKAJDG6CF0EXGJL');
    expect(shortCodeFromUrl('ZScU6dsbUk98nsJEAA')).toBe('ZScU6dsbUk98nsJEAA');
    expect(() => shortCodeFromUrl('https://1a4.com/')).toThrow(RangeError);
  });

  it('RC-05 associate sends a top-level array of {PackageLabel, QrUrls}', async () => {
    const { client, calls } = makeClient([ok({ Added: 2 })]);
    expect(await client.associate(LICENSE, [{ packageLabel: LABEL, qrUrls: [QR_A, QR_B] }])).toEqual({ Added: 2 });
    expect(calls[0]).toMatchObject({ method: 'POST', path: '/retailid/v2/associate', query: { licenseNumber: LICENSE } });
    expect(calls[0]!.bodyText).toBe(JSON.stringify([{ PackageLabel: LABEL, QrUrls: [QR_A, QR_B] }]));
  });

  it('RC-06 associatePackage and wire-shaped input produce identical bodies', async () => {
    const { client, calls } = makeClient([ok(null), ok(null)]);
    await client.associatePackage(LICENSE, LABEL, [QR_A]);
    await client.associate(LICENSE, [{ PackageLabel: LABEL, QrUrls: [QR_A] }]);
    expect(calls[0]!.bodyText).toBe(calls[1]!.bodyText);
  });

  it('RC-07 limits associations to 1..10 entries', async () => {
    const { client, calls } = makeClient();
    const entry = { packageLabel: LABEL, qrUrls: [QR_A] };
    await expect(client.associate(LICENSE, Array(11).fill(entry))).rejects.toThrow(/no more than 10/);
    await expect(client.associate(LICENSE, [])).rejects.toThrow(RangeError);
    expect(calls).toHaveLength(0);
  });

  it('RC-08 merge sends the target first', async () => {
    const { client, calls } = makeClient([ok({ Ids: [1], Warnings: null })]);
    expect(await client.merge(LICENSE, LABEL, SOURCE_LABEL)).toEqual({ Ids: [1], Warnings: null });
    expect(calls[0]).toMatchObject({ method: 'POST', path: '/retailid/v2/merge', json: { packageLabels: [LABEL, SOURCE_LABEL] } });
  });

  it('RC-09 merge rejects identical labels without sending', async () => {
    const { client, calls } = makeClient();
    await expect(client.merge(LICENSE, LABEL, LABEL)).rejects.toThrow(/must differ/);
    expect(calls).toHaveLength(0);
  });

  it('RC-10 a 422 merge rejection is raised once and never retried', async () => {
    const { client, calls } = makeClient([ok({ Message: 'Lab results differ' }, 422)]);
    const error = (await rejection(client.merge(LICENSE, LABEL, SOURCE_LABEL))) as UnprocessableError;
    expect(error).toBeInstanceOf(UnprocessableError);
    expect(error.apiMessage).toBe('Lab results differ');
    expect(error.message).toBe('422 POST /retailid/v2/merge: Lab results differ');
    expect(calls).toHaveLength(1);
  });

  it('RC-11 a non-object receive body raises RetailIdResponseError (Python crashes; Java returns empty)', async () => {
    const { client } = makeClient([ok([{ Eaches: [] }]), ok(null)]);
    await expect(client.receive(LICENSE, LABEL)).rejects.toThrow(RetailIdResponseError);
    await expect(client.receiveByQr(LICENSE, QR_A)).rejects.toThrow(/expected a JSON object, got null/);
  });

  it('RC-12 malformed association entries are TypeErrors/RangeErrors before sending', async () => {
    const { client, calls } = makeClient();
    await expect(client.associate(LICENSE, [null as never])).rejects.toThrow(TypeError);
    await expect(client.associate(LICENSE, [{ packageLabel: LABEL, qrUrls: QR_A as never }])).rejects.toThrow(/qrUrls must be an array/);
    await expect(client.associate(LICENSE, [{ packageLabel: LABEL, qrUrls: [QR_A, 5 as never] }])).rejects.toThrow(/qrUrls\[1\]/);
    await expect(client.associate(LICENSE, [{ PackageLabel: '', QrUrls: [] }])).rejects.toThrow(/PackageLabel must not be empty/);
    expect(calls).toHaveLength(0);
  });

  it('RC-13 shortCodeFromUrl edge cases (query, fragment, no scheme, whitespace, trailing slash, ambiguity)', () => {
    expect(shortCodeFromUrl('https://1a4.com/ABC?x=1#frag')).toBe('ABC');
    expect(shortCodeFromUrl('1a4.com/ABC')).toBe('ABC');
    expect(shortCodeFromUrl('  https://1a4.com/ABC/  ')).toBe('ABC');
    expect(() => shortCodeFromUrl('https://1a4.com/a/b/ABC')).toThrow(/Ambiguous/);
    expect(() => shortCodeFromUrl('https://1a4.com/AB%20C')).toThrow(/Malformed short code/);
    expect(() => shortCodeFromUrl('')).toThrow(RangeError);
    expect(() => shortCodeFromUrl(7 as never)).toThrow(TypeError);
  });

  it('RC-14 receive with a malformed field names it (D2): Eaches must contain strings', async () => {
    const { client } = makeClient([ok({ Eaches: [QR_A, 5] }), ok({ RequiresVerification: 'false' })]);
    const error = (await rejection(client.receive(LICENSE, LABEL))) as RetailIdResponseError;
    expect(error.field).toBe('ReceiveResult.Eaches[1]');
    await expect(client.receive(LICENSE, LABEL)).rejects.toThrow(/RequiresVerification: expected a boolean, got string/);
  });
});
