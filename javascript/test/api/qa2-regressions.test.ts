// Regression tests for corrections confirmed by the QA2-E2 live responses and
// the approved D2 rule (missing or explicit null response fields stay null).

import { describe, expect, it } from 'vitest';

import { PackageInfo, RetailIdResponseError } from '../../src/api/index.js';
import { LABEL, LICENSE, makeClient, ok, rejection } from './helpers.js';

describe('QA2-E2 / D2 regressions', () => {
  it('QA2-01 package-info record with Issuances: null and a string IssuanceId (QA2-E2 shape)', async () => {
    const { client } = makeClient([
      ok({ Packages: [{ Tag: LABEL, QrCount: 0, Issuances: null, IssuanceId: '661d835f5f6fac1d7ee1f347', HasQrs: false, RequiresVerification: false }] }),
    ]);
    const [info] = await client.getPackagesInfo(LICENSE, [LABEL]);
    expect(info!.packageLabel).toBe(LABEL);
    expect(info!.issuances).toBeNull();
    expect(info!.issuanceId).toBe('661d835f5f6fac1d7ee1f347');
    expect(info!.raw['Issuances']).toBeNull();
  });

  it('QA2-02 absent Issuances and IssuanceId are null, while an empty list stays []', () => {
    const absent = PackageInfo.fromJson({ Tag: LABEL });
    expect([absent.issuances, absent.issuanceId]).toEqual([null, null]);
    expect(PackageInfo.fromJson({ Tag: LABEL, Issuances: [] }).issuances).toEqual([]);
  });

  it('QA2-03 a non-string package IssuanceId is a typed, descriptive error', async () => {
    const { client } = makeClient([ok({ Packages: [{ Tag: LABEL, IssuanceId: 12345 }] })]);
    const error = (await rejection(client.getPackagesInfo(LICENSE, [LABEL]))) as RetailIdResponseError;
    expect(error).toBeInstanceOf(RetailIdResponseError);
    expect(error.field).toBe('PackageInfo.IssuanceId');
    expect(error.message).toMatch(/PackageInfo\.IssuanceId: expected a string, got number/);
    expect(error.path).toBe('/retailid/v2/packages/info');
  });

  it('QA2-04 receive preserves null Eaches and absent SiblingTags as null', async () => {
    const { client } = makeClient([ok({ Eaches: null, QrCount: 0 })]);
    const received = await client.receive(LICENSE, LABEL);
    expect(received.eaches).toBeNull();
    expect(received.siblingTags).toBeNull();
    expect(received.qrCount).toBe(0);
  });
});
