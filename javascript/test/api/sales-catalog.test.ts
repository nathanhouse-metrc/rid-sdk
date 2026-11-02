import { describe, expect, it } from 'vitest';

import { RetailIdResponseError, SALES_ENDPOINTS, ServerError } from '../../src/api/index.js';
import { LABEL, LICENSE, QR_A, QR_B, makeClient, ok } from './helpers.js';

const RECEIPT = {
  SalesDateTime: '2026-10-28T12:00:00',
  Transactions: [{ PackageLabel: LABEL, QrCodes: [QR_A, QR_B] }],
};

describe('sales (Py TestSales / Java Sales)', () => {
  it('SL-01 postSalesReceipts: POST /sales/v2/receipts with the records as an array', async () => {
    const { client, calls } = makeClient([ok({ Ids: [42], Warnings: null })]);
    expect(await client.postSalesReceipts(LICENSE, [RECEIPT])).toEqual({ Ids: [42], Warnings: null });
    expect(calls[0]).toMatchObject({ method: 'POST', path: '/sales/v2/receipts', query: { licenseNumber: LICENSE }, json: [RECEIPT] });
  });

  it.each([
    ['deliveries', '/sales/v2/deliveries'],
    ['deliveries_retailer', '/sales/v2/deliveries/retailer'],
    ['deliveries_retailer_sale', '/sales/v2/deliveries/retailer/sale'],
  ] as const)('SL-02..04 postSales endpoint %s -> %s', async (endpoint, path) => {
    const { client, calls } = makeClient([ok({ Ids: [1] })]);
    await client.postSales(LICENSE, [RECEIPT], { endpoint });
    expect(calls[0]!.path).toBe(path);
  });

  it('SL-05 rejects unknown endpoints (including inherited keys) without sending', async () => {
    const { client, calls } = makeClient();
    await expect(client.postSales(LICENSE, [RECEIPT], { endpoint: 'nope' as never })).rejects.toThrow(/Unknown sales endpoint 'nope'/);
    await expect(client.postSales(LICENSE, [RECEIPT], { endpoint: 'toString' as never })).rejects.toThrow(RangeError);
    expect(calls).toHaveLength(0);
    expect(Object.isFrozen(SALES_ENDPOINTS)).toBe(true);
  });

  it('SL-06 requires 1..10 plain-object records', async () => {
    const { client, calls } = makeClient();
    await expect(client.postSales(LICENSE, [])).rejects.toThrow(RangeError);
    await expect(client.postSales(LICENSE, Array(11).fill(RECEIPT))).rejects.toThrow(/no more than 10/);
    await expect(client.postSales(LICENSE, [[] as never])).rejects.toThrow(/records\[0\] must be an object/);
    expect(calls).toHaveLength(0);
  });

  it('SL-07 a sales 500 is a write: raised immediately, never retried', async () => {
    const { client, calls } = makeClient([ok(null, 500)]);
    await expect(client.postSalesReceipts(LICENSE, [RECEIPT])).rejects.toThrow(ServerError);
    expect(calls).toHaveLength(1);
  });

  it('SL-08 the caller\'s record objects are sent unchanged and not mutated', async () => {
    const record = structuredClone(RECEIPT);
    const { client, calls } = makeClient([ok({})]);
    await client.postSalesReceipts(LICENSE, [record]);
    expect(record).toEqual(RECEIPT);
    expect(calls[0]!.json).toEqual([RECEIPT]);
  });
});

describe('catalog (Py TestCatalog / Java Catalog)', () => {
  it('CT-01 follows pages with exact query parameters and no licenseNumber', async () => {
    const { client, calls } = makeClient([
      ok({ Data: [{ Id: 1 }, { Id: 2 }], TotalPages: 2, PageNumber: 1 }),
      ok({ Data: [{ Id: 3 }], TotalPages: 2, PageNumber: 2 }),
    ]);
    const products = (await client.getGlobalProducts(77, { pageSize: 2 })) as Array<{ Id: number }>;
    expect(products.map((p) => p.Id)).toEqual([1, 2, 3]);
    expect(calls[0]!.query).toEqual({ brandId: '77', pageNumber: '1', pageSize: '2' });
    expect(calls[1]!.query['pageNumber']).toBe('2');
    expect(calls[0]!.path).toBe('/globalproducts/v2');
  });

  it('CT-02 iteration is lazy (J iteratorIsLazy)', async () => {
    const { client, calls } = makeClient([
      ok({ Data: [{ Id: 1 }], TotalPages: 2 }),
      ok({ Data: [{ Id: 2 }], TotalPages: 2 }),
    ]);
    const iterator = client.iterGlobalProducts(77);
    expect(calls).toHaveLength(0);
    await iterator.next();
    expect(calls).toHaveLength(1);
    await iterator.next();
    expect((await iterator.next()).done).toBe(true);
    expect(calls).toHaveLength(2);
  });

  it('CT-03 a bare-array response is treated as unpaged: one request (J unpagedListResponse)', async () => {
    const { client, calls } = makeClient([ok([{ Id: 1 }, { Id: 2 }])]);
    expect(await client.getGlobalProducts(77)).toHaveLength(2);
    expect(calls).toHaveLength(1);
  });

  it('CT-04 getGlobalProduct: GET /globalproducts/v2/{id}', async () => {
    const { client, calls } = makeClient([ok({ Id: 5, DisplayName: 'Gummies' })]);
    expect(await client.getGlobalProduct(5)).toEqual({ Id: 5, DisplayName: 'Gummies' });
    expect(calls[0]!.path).toBe('/globalproducts/v2/5');
    expect(calls[0]!.rawQuery).toBe('');
  });

  it('CT-05 string TotalPages, empty page stops, null body -> [] (probe-verified Python behaviour)', async () => {
    const a = makeClient([ok({ Data: [1], TotalPages: '2' }), ok({ Data: [], TotalPages: 2 })]);
    expect(await a.client.getGlobalProducts(1)).toEqual([1]);
    expect(a.calls).toHaveLength(2);
    const b = makeClient([ok(null)]);
    expect(await b.client.getGlobalProducts(1)).toEqual([]);
  });

  it('CT-06 breaking out of for-await stops further requests', async () => {
    const { client, calls, remaining } = makeClient([
      ok({ Data: [{ Id: 1 }, { Id: 2 }], TotalPages: 5 }),
      ok({ Data: [{ Id: 3 }], TotalPages: 5 }),
    ]);
    for await (const product of client.iterGlobalProducts(1)) {
      expect(product).toEqual({ Id: 1 });
      break;
    }
    expect(calls).toHaveLength(1);
    expect(remaining()).toBe(1);
  });

  it('CT-07 malformed paging fields raise RetailIdResponseError; invalid inputs are rejected', async () => {
    const { client } = makeClient([ok({ Data: {}, TotalPages: 1 }), ok({ Data: [], TotalPages: 'many' })]);
    await expect(client.getGlobalProducts(1)).rejects.toThrow(RetailIdResponseError);
    await expect(client.getGlobalProducts(1)).rejects.toThrow(/TotalPages/);
    await expect(client.getGlobalProducts(1, { pageSize: 0 })).rejects.toThrow(RangeError);
    await expect(client.getGlobalProduct('')).rejects.toThrow(RangeError);
  });
});
