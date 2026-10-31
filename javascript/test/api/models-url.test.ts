import { describe, expect, it } from 'vitest';

import {
  Allotment,
  Association,
  GenerateResult,
  PackageInfo,
  ReceiveResult,
  RetailIdResponseError,
} from '../../src/api/index.js';
import { buildQuery, encodePathSegment } from '../../src/api/url.js';

const field = (fn: () => unknown): string | null => {
  try {
    fn();
  } catch (error) {
    if (error instanceof RetailIdResponseError) return error.field;
    throw error;
  }
  return 'NO ERROR';
};

describe('D2 response coercion policy (interim; pending approval)', () => {
  it('MD-01 integers: numbers and canonical integer strings only', () => {
    expect(Allotment.fromJson({ Allotment: 5000 }).allotment).toBe(5000);
    expect(Allotment.fromJson({ Allotment: '5000' }).allotment).toBe(5000);
    expect(Allotment.fromJson({ Allotment: '-3' }).allotment).toBe(-3);
    for (const bad of ['abc', '12.7', ' 7', '007', '1e3', '', 12.7, true, [], {}]) {
      expect(field(() => Allotment.fromJson({ Allotment: bad }))).toBe('Allotment.Allotment');
    }
    expect(field(() => Allotment.fromJson({ Allotment: 2 ** 60 }))).toBe('Allotment.Allotment');
  });

  it('MD-02 booleans: JSON booleans only ("false" is malformed, not true as in Python)', () => {
    expect(PackageInfo.fromJson({ HasQrs: true }).hasQrs).toBe(true);
    expect(PackageInfo.fromJson({ HasQrs: false }).hasQrs).toBe(false);
    for (const bad of ['false', 'true', 0, 1, []]) {
      expect(field(() => PackageInfo.fromJson({ HasQrs: bad }))).toBe('PackageInfo.HasQrs');
    }
  });

  it('MD-03 absent and null scalars become null — never a fabricated 0 / false / ""', () => {
    const info = PackageInfo.fromJson({});
    expect(info).toMatchObject({ packageLabel: null, qrCount: null, hasQrs: null, siblingCount: null, requiresVerification: null, estimatedBalance: null });
    expect(info.issuances).toEqual([]);
    expect(Allotment.fromJson({ Allotment: null }).allotment).toBeNull();
    expect(GenerateResult.fromJson({}).issuanceId).toBeNull();
  });

  it('MD-04 strings: JSON strings only', () => {
    expect(ReceiveResult.fromJson({ ChildTag: 'X' }).childTag).toBe('X');
    expect(field(() => ReceiveResult.fromJson({ ChildTag: 5 }))).toBe('ReceiveResult.ChildTag');
    expect(field(() => PackageInfo.fromJson({ PackageLabel: 5 }))).toBe('PackageInfo.PackageLabel');
  });

  it('MD-05 lists: absent/null -> [], non-array or wrong item type -> malformed', () => {
    expect(ReceiveResult.fromJson({ Eaches: null }).eaches).toEqual([]);
    expect(field(() => ReceiveResult.fromJson({ Eaches: 'x' }))).toBe('ReceiveResult.Eaches');
    expect(field(() => ReceiveResult.fromJson({ SiblingTags: [1] }))).toBe('ReceiveResult.SiblingTags[0]');
    expect(field(() => PackageInfo.fromJson({ Issuances: [5] }))).toBe('PackageInfo.Issuances[0]');
    expect(field(() => PackageInfo.fromJson({ Issuances: [{ LabelSet: 'x' }] }))).toBe('Issuance.LabelSet');
  });

  it('MD-06 PackageLabel falls back to Label when absent or empty (Python `or`)', () => {
    expect(PackageInfo.fromJson({ PackageLabel: 'P', Label: 'L' }).packageLabel).toBe('P');
    expect(PackageInfo.fromJson({ PackageLabel: '', Label: 'L' }).packageLabel).toBe('L');
    expect(PackageInfo.fromJson({ Label: 'L' }).packageLabel).toBe('L');
  });

  it('D7-04 recognizes documented Tag, preserves legacy precedence, and rejects malformed names', () => {
    expect(PackageInfo.fromJson({ Tag: 'T' }).packageLabel).toBe('T');
    expect(PackageInfo.fromJson({ PackageLabel: 'P', Label: 'L', Tag: 'T' }).packageLabel).toBe('P');
    expect(PackageInfo.fromJson({ PackageLabel: '', Label: 'L', Tag: 'T' }).packageLabel).toBe('L');
    expect(PackageInfo.fromJson({ PackageLabel: null, Label: '', Tag: 'T' }).packageLabel).toBe('T');
    expect(field(() => PackageInfo.fromJson({ Tag: 5 }))).toBe('PackageInfo.Tag');
    expect(field(() => PackageInfo.fromJson({ PackageLabel: 5, Tag: 'T' }))).toBe('PackageInfo.PackageLabel');
  });

  it('MD-07 the whole body must be an object', () => {
    for (const bad of [null, [], 'text', 5]) {
      expect(field(() => ReceiveResult.fromJson(bad))).toBe('ReceiveResult');
    }
  });

  it('MD-08 IssuanceId: strings, or safe integers rendered as strings; other types malformed', () => {
    expect(GenerateResult.fromJson({ IssuanceId: 'abc' }).issuanceId).toBe('abc');
    expect(GenerateResult.fromJson({ IssuanceId: 42 }).issuanceId).toBe('42');
    expect(field(() => GenerateResult.fromJson({ IssuanceId: true }))).toBe('GenerateResult.IssuanceId');
  });

  it('MD-09 models are frozen; raw keeps unknown fields and is frozen too', () => {
    const result = ReceiveResult.fromJson({ Eaches: ['a'], Extra: { nested: 1 }, Ranges: [{ From: 1 }] });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.raw)).toBe(true);
    expect(Object.isFrozen(result.eaches)).toBe(true);
    expect(result.raw['Extra']).toEqual({ nested: 1 });
    expect(result.ranges).toEqual([{ From: 1 }]);
    expect(ReceiveResult.fromJson({}).ranges).toBeNull();
  });

  it('MD-10 Association.toJson produces the wire shape from either input form', () => {
    expect(Association.toJson({ packageLabel: 'P', qrUrls: ['u'] })).toEqual({ PackageLabel: 'P', QrUrls: ['u'] });
    expect(JSON.stringify(Association.toJson({ PackageLabel: 'P', QrUrls: ['u'] }))).toBe('{"PackageLabel":"P","QrUrls":["u"]}');
  });
});

describe('URL helpers', () => {
  it('UR-01 encodePathSegment matches Python quote(safe="") across reserved and non-ASCII characters', () => {
    expect(encodePathSegment("a/b c!'()*~-._")).toBe('a%2Fb%20c%21%27%28%29%2A~-._');
    expect(encodePathSegment('?#&=+%')).toBe('%3F%23%26%3D%2B%25');
    expect(encodePathSegment('é✓')).toBe('%C3%A9%E2%9C%93');
    expect(encodePathSegment('1A4060300007777000000001')).toBe('1A4060300007777000000001');
  });

  it('UR-02 buildQuery drops null/undefined, keeps 0 and false', () => {
    expect(buildQuery(undefined, { a: null, b: undefined, c: 0, d: false })).toBe('?c=0&d=false');
    expect(buildQuery(undefined, undefined)).toBe('');
  });

  it('UR-03 params override licenseNumber, which keeps first position (Python order)', () => {
    expect(buildQuery('837-XYZ', { pageNumber: 1, licenseNumber: 'OVERRIDE' })).toBe('?licenseNumber=OVERRIDE&pageNumber=1');
  });

  it('UR-04 booleans serialize as "true"/"false" (Python sends "True"; documented divergence)', () => {
    expect(buildQuery(undefined, { flag: true })).toBe('?flag=true');
  });

  it('UR-05 spaces encode as "+", like requests and Java URLEncoder; bad values are rejected', () => {
    expect(buildQuery('a b', undefined)).toBe('?licenseNumber=a+b');
    expect(() => buildQuery(undefined, { x: Number.NaN })).toThrow(RangeError);
    expect(() => buildQuery(undefined, { x: {} as never })).toThrow(TypeError);
  });
});
