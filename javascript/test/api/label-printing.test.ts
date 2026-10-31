import { describe, expect, it } from 'vitest';

import { RetailIdResponseError } from '../../src/api/index.js';
import { LABEL, LICENSE, makeClient, ok, rejection, timeoutError } from './helpers.js';

describe('label printing (Py TestLabelPrinting / Java LabelPrinting)', () => {
  it('LP-01 getFacilities: GET /facilities/v2/ (trailing slash), list or {Data}, null Data -> []', async () => {
    const { client, calls } = makeClient([ok([{ License: { Number: LICENSE } }]), ok({ Data: [{ Id: 1 }] }), ok({ Data: null }), ok(null)]);
    expect(await client.getFacilities()).toEqual([{ License: { Number: LICENSE } }]);
    expect(await client.getFacilities()).toEqual([{ Id: 1 }]);
    expect(await client.getFacilities()).toEqual([]);
    expect(await client.getFacilities()).toEqual([]);
    expect(calls[0]!.method).toBe('GET');
    expect(calls[0]!.path).toBe('/facilities/v2/');
    expect(calls[0]!.rawQuery).toBe('');
    expect(calls[0]!.bodyText).toBeUndefined();
  });

  it('LP-02 getAllotment: query licenseNumber; object body wraps to a list', async () => {
    const { client, calls } = makeClient([
      ok([{ FacilityId: 1234, FacilityLicenseNumber: LICENSE, Allotment: 5000 }]),
      ok({ FacilityId: 1, Allotment: 5 }),
    ]);
    const [allotment] = await client.getAllotment(LICENSE);
    expect(allotment).toMatchObject({ facilityId: 1234, facilityLicenseNumber: LICENSE, allotment: 5000 });
    expect(calls[0]).toMatchObject({ method: 'GET', path: '/retailid/v2/allotment', query: { licenseNumber: LICENSE } });
    const wrapped = await client.getAllotment(LICENSE);
    expect(wrapped).toHaveLength(1);
    expect(wrapped[0]!.facilityLicenseNumber).toBeNull();
  });

  it('LP-03 generate: POST body {PackageLabel, Quantity} with JSON content type', async () => {
    const { client, calls } = makeClient([ok({ IssuanceId: '661d835f5f6fac1d7ee1f347' })]);
    const result = await client.generate(LICENSE, LABEL, 3);
    expect(result.issuanceId).toBe('661d835f5f6fac1d7ee1f347');
    expect(calls[0]).toMatchObject({ method: 'POST', path: '/retailid/v2/generate', query: { licenseNumber: LICENSE } });
    expect(calls[0]!.bodyText).toBe(JSON.stringify({ PackageLabel: LABEL, Quantity: 3 }));
    expect(calls[0]!.headers['Content-Type']).toBe('application/json');
  });

  it('LP-04 generate rejects invalid quantities before sending anything', async () => {
    const { client, calls } = makeClient();
    await expect(client.generate(LICENSE, LABEL, 0)).rejects.toThrow(RangeError);
    await expect(client.generate(LICENSE, LABEL, 2.5)).rejects.toThrow(RangeError);
    await expect(client.generate(LICENSE, LABEL, Number.NaN)).rejects.toThrow(RangeError);
    await expect(client.generate(LICENSE, LABEL, Infinity)).rejects.toThrow(RangeError);
    await expect(client.generate(LICENSE, LABEL, true as never)).rejects.toThrow(TypeError);
    await expect(client.generate(LICENSE, LABEL, '3' as never)).rejects.toThrow(TypeError);
    await expect(client.generate('', LABEL, 1)).rejects.toThrow(RangeError);
    await expect(client.generate(LICENSE, '', 1)).rejects.toThrow(RangeError);
    expect(calls).toHaveLength(0);
  });

  it('LP-05 getPackagesInfo maps every field, including issuances', async () => {
    const { client, calls } = makeClient([
      ok([
        {
          PackageLabel: LABEL,
          QrCount: 3,
          HasQrs: true,
          Issuances: [{ LabelSet: 1, LabelQuantity: 3, CreatedAt: '2026-10-21T00:00:00Z' }],
          SiblingCount: 0,
          RequiresVerification: false,
          EstimatedBalance: 3,
        },
      ]),
    ]);
    const [info] = await client.getPackagesInfo(LICENSE, [LABEL]);
    expect(info).toMatchObject({ packageLabel: LABEL, qrCount: 3, hasQrs: true, siblingCount: 0, requiresVerification: false, estimatedBalance: 3 });
    expect(info!.issuances[0]).toMatchObject({ labelSet: 1, labelQuantity: 3, createdAt: '2026-10-21T00:00:00Z' });
    expect(calls[0]).toMatchObject({ method: 'POST', path: '/retailid/v2/packages/info', json: { packageLabels: [LABEL] } });
  });

  it('LP-06 getPackageInfo: {Data} wrapper and Label fallback; empty result -> undefined (J packageInfoSingleAndDataWrapper)', async () => {
    const { client } = makeClient([ok({ Data: [{ Label: LABEL, QrCount: 2 }] }), ok([])]);
    const info = await client.getPackageInfo(LICENSE, LABEL);
    expect(info?.packageLabel).toBe(LABEL);
    expect(info?.qrCount).toBe(2);
    expect(await client.getPackageInfo(LICENSE, LABEL)).toBeUndefined();
  });

  it('LP-07 sends package labels in chunks of 10, in order', async () => {
    const labels = Array.from({ length: 23 }, (_, i) => `1A40603000077770000000${String(i).padStart(2, '0')}`);
    const { client, calls } = makeClient([ok([]), ok([]), ok([])]);
    await client.getPackagesInfo(LICENSE, labels);
    expect(calls.map((c) => (c.json as { packageLabels: string[] }).packageLabels.length)).toEqual([10, 10, 3]);
    expect(calls.flatMap((c) => (c.json as { packageLabels: string[] }).packageLabels)).toEqual(labels);
  });

  it('LP-08 retries a 503 on packages/info (read-only POST)', async () => {
    const { client, calls, sleeps } = makeClient([ok({ Message: 'boom' }, 503), ok([])]);
    expect(await client.getPackagesInfo(LICENSE, [LABEL])).toEqual([]);
    expect(calls).toHaveLength(2);
    expect(sleeps).toHaveLength(1);
  });

  it('LP-09 available tags and package paths', async () => {
    const { client, calls } = makeClient([ok({ Data: [{ Label: LABEL }] }), ok({ Id: 1 }), ok({ Id: 2 })]);
    expect(await client.getAvailableTags(LICENSE)).toEqual([{ Label: LABEL }]);
    expect(await client.getPackage(LICENSE, LABEL)).toEqual({ Id: 1 });
    expect(await client.getPackage(LICENSE, 42)).toEqual({ Id: 2 });
    expect(calls.map((c) => c.path)).toEqual(['/tags/v2/package/available', `/packages/v2/${LABEL}`, '/packages/v2/42']);
    expect(calls.every((c) => c.query['licenseNumber'] === LICENSE)).toBe(true);
  });

  it('LP-10 escapes path segments like Python quote(safe="") (J pathSegmentsAreEscaped)', async () => {
    const { client, calls } = makeClient([ok({ Id: 1 })]);
    await client.getPackage(LICENSE, "a/b c!'()*~");
    expect(new URL(calls[0]!.url).pathname).toBe('/packages/v2/a%2Fb%20c%21%27%28%29%2A~');
  });

  it('LP-11 accepts a single label string (Python) and rejects empty/invalid label lists', async () => {
    const { client, calls } = makeClient([ok([])]);
    await client.getPackagesInfo(LICENSE, LABEL);
    expect(calls[0]!.json).toEqual({ packageLabels: [LABEL] });
    await expect(client.getPackagesInfo(LICENSE, [])).rejects.toThrow(RangeError);
    await expect(client.getPackagesInfo(LICENSE, [LABEL, 7 as never])).rejects.toThrow(/packageLabels\[1\]/);
    await expect(client.getPackagesInfo(LICENSE, 5 as never)).rejects.toThrow(TypeError);
    await expect(client.getPackage(LICENSE, -1)).rejects.toThrow(RangeError);
  });

  it('LP-12 retries a timeout on packages/info (probe-verified Python behaviour)', async () => {
    const { client, calls } = makeClient([timeoutError(), ok([])]);
    expect(await client.getPackagesInfo(LICENSE, [LABEL])).toEqual([]);
    expect(calls).toHaveLength(2);
  });

  it('LP-13 a malformed packages/info body raises RetailIdResponseError with context (D2)', async () => {
    const { client } = makeClient([ok([{ PackageLabel: LABEL, QrCount: 'abc' }])]);
    const error = (await rejection(client.getPackagesInfo(LICENSE, [LABEL]))) as RetailIdResponseError;
    expect(error).toBeInstanceOf(RetailIdResponseError);
    expect(error.field).toBe('PackageInfo.QrCount');
    expect(error.path).toBe('/retailid/v2/packages/info');
    expect(error.message).toMatch(/expected an integer, got string/);
    expect(error.body).toEqual([{ PackageLabel: LABEL, QrCount: 'abc' }]);
  });

  it('LP-14 an object without Data for a list endpoint is malformed, not silently [] (D2 divergence)', async () => {
    const { client } = makeClient([ok({ Unexpected: true }), ok('plain text')]);
    await expect(client.getFacilities()).rejects.toThrow(RetailIdResponseError);
    await expect(client.getAvailableTags(LICENSE)).rejects.toThrow(/expected an array or \{ Data/);
  });

  it('LP-15 generate with an empty or non-object 2xx body raises RetailIdResponseError (write applied; do not resend)', async () => {
    const { client } = makeClient([ok(null), ok({ IssuanceId: { nested: true } }), ok({})]);
    const empty = (await rejection(client.generate(LICENSE, LABEL, 1))) as RetailIdResponseError;
    expect(empty).toBeInstanceOf(RetailIdResponseError);
    expect(empty.statusCode).toBe(200);
    await expect(client.generate(LICENSE, LABEL, 1)).rejects.toThrow(/IssuanceId/);
    expect((await client.generate(LICENSE, LABEL, 1)).issuanceId).toBeNull();
  });
});
