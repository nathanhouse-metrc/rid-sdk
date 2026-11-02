import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  AuthenticationError,
  BadRequestError,
  ConflictError,
  NotFoundError,
  PermissionDeniedError,
  RateLimitError,
  RetailIdApiError,
  RetailIdClient,
  RetailIdError,
  RetailIdNetworkError,
  RetailIdTimeoutError,
  ServerError,
  UnprocessableError,
  errorForStatus,
} from '../../src/api/index.js';
import {
  LABEL,
  LICENSE,
  SOURCE_LABEL,
  USER_KEY,
  VENDOR_KEY,
  makeClient,
  networkError,
  ok,
  rejection,
  timeoutError,
} from './helpers.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('errors and retries (Py TestErrorsAndRetries / Java ErrorsAndRetries)', () => {
  it('ER-01 401 -> AuthenticationError; keys never appear in the error', async () => {
    const { client } = makeClient([ok({ Message: 'bad keys' }, 401)]);
    const error = (await rejection(client.getFacilities())) as AuthenticationError;
    expect(error).toBeInstanceOf(AuthenticationError);
    expect(error.statusCode).toBe(401);
    const everything = `${error.message} ${error.stack} ${JSON.stringify(error)}`;
    expect(everything).not.toContain(VENDOR_KEY);
    expect(everything).not.toContain(USER_KEY);
  });

  it('ER-02 404 with a list body joins the messages', async () => {
    const { client } = makeClient([ok([{ message: 'Package not found' }], 404)]);
    await expect(client.receive(LICENSE, LABEL)).rejects.toThrow(NotFoundError);
    const again = makeClient([ok([{ message: 'Package not found' }], 404)]);
    await expect(again.client.receive(LICENSE, LABEL)).rejects.toThrow('Package not found');
  });

  it('ER-03 429 waits Retry-After seconds (as ms) and retries, even for a write', async () => {
    const { client, calls, sleeps } = makeClient([ok(null, 429, { 'Retry-After': '7' }), ok({ IssuanceId: 'abc' })]);
    expect((await client.generate(LICENSE, LABEL, 1)).issuanceId).toBe('abc');
    expect(sleeps).toEqual([7_000]);
    expect(calls).toHaveLength(2);
  });

  it('ER-04 429 without Retry-After backs off base × 2^(n−1) + [0, 250) ms', async () => {
    const { client, sleeps } = makeClient([ok(null, 429), ok(null, 429), ok([])], { backoffBaseMs: 1_000 });
    await client.getFacilities();
    expect(sleeps).toHaveLength(2);
    expect(sleeps[0]).toBeGreaterThanOrEqual(1_000);
    expect(sleeps[0]).toBeLessThan(1_250);
    expect(sleeps[1]).toBeGreaterThanOrEqual(2_000);
    expect(sleeps[1]).toBeLessThan(2_250);
  });

  it('ER-04b backoff is exact with a fixed random source', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const { client, sleeps } = makeClient([ok(null, 503), ok(null, 503), ok(null, 503), ok([])], { backoffBaseMs: 100 });
    await client.getFacilities();
    expect(sleeps).toEqual([225, 325, 525]);
  });

  it('ER-05 gives up after maxRetries (3 calls with maxRetries 2)', async () => {
    const { client, calls } = makeClient([ok(null, 429), ok(null, 429), ok(null, 429)], { maxRetries: 2 });
    await expect(client.getFacilities()).rejects.toThrow(RateLimitError);
    expect(calls).toHaveLength(3);
  });

  it('ER-06 a GET retries a 502', async () => {
    const { client, calls } = makeClient([ok(null, 502), ok({ Eaches: [] })]);
    await client.receive(LICENSE, LABEL);
    expect(calls).toHaveLength(2);
  });

  it('ER-07 a write never retries a 500', async () => {
    const { client, calls } = makeClient([ok(null, 500)]);
    await expect(client.generate(LICENSE, LABEL, 1)).rejects.toThrow(ServerError);
    expect(calls).toHaveLength(1);
  });

  it('ER-08 a write timeout is not retried; RetailIdTimeoutError keeps method, path and cause', async () => {
    const cause = timeoutError();
    const { client, calls } = makeClient([cause]);
    const error = (await rejection(client.generate(LICENSE, LABEL, 1))) as RetailIdTimeoutError;
    expect(error).toBeInstanceOf(RetailIdTimeoutError);
    expect(error.method).toBe('POST');
    expect(error.path).toBe('/retailid/v2/generate');
    expect(error.cause).toBe(cause);
    expect(error.message).toBe('POST /retailid/v2/generate timed out after 30000 ms');
    expect(calls).toHaveLength(1);
  });

  it('ER-09 a read timeout is retried', async () => {
    const { client, calls } = makeClient([timeoutError(), ok({ Eaches: ['https://1a4.com/ABC'] })]);
    expect((await client.receive(LICENSE, LABEL)).eaches).toEqual(['https://1a4.com/ABC']);
    expect(calls).toHaveLength(2);
  });

  it('ER-10 network failures become RetailIdNetworkError with the original cause and are never retried', async () => {
    const getFailure = networkError('ECONNREFUSED');
    const read = makeClient([getFailure]);
    const error = (await rejection(read.client.getFacilities())) as RetailIdNetworkError;
    expect(error).toBeInstanceOf(RetailIdNetworkError);
    expect(error).toBeInstanceOf(RetailIdError);
    expect(error.cause).toBe(getFailure);
    expect(error.message).toBe('GET /facilities/v2/ failed: fetch failed (ECONNREFUSED)');
    expect(read.calls).toHaveLength(1);
    const write = makeClient([networkError()]);
    await expect(write.client.merge(LICENSE, LABEL, SOURCE_LABEL)).rejects.toThrow(RetailIdNetworkError);
    expect(write.calls).toHaveLength(1);
  });

  it('ER-11 a non-JSON error body becomes apiMessage and body (J nonJsonBodyIsReturnedAsText)', async () => {
    const { client } = makeClient([new Response('plain failure', { status: 400 })]);
    const error = (await rejection(client.getFacilities())) as BadRequestError;
    expect(error).toBeInstanceOf(BadRequestError);
    expect(error.apiMessage).toBe('plain failure');
    expect(error.body).toBe('plain failure');
  });

  it('ER-12 errorForStatus maps every status (Py test_errors_module_maps_status / J forStatusMapsStatus)', () => {
    const forbidden = errorForStatus(403, { Message: 'no access' }, {}, { method: 'GET', path: '/x' });
    expect(forbidden).toBeInstanceOf(PermissionDeniedError);
    expect(forbidden.apiMessage).toBe('no access');
    expect(forbidden.message).toBe('403 GET /x: no access');
    expect(errorForStatus(400, null)).toBeInstanceOf(BadRequestError);
    expect(errorForStatus(409, null)).toBeInstanceOf(ConflictError);
    expect(errorForStatus(422, null)).toBeInstanceOf(UnprocessableError);
    expect(errorForStatus(503, null)).toBeInstanceOf(ServerError);
    expect(errorForStatus(599, null)).toBeInstanceOf(ServerError);
    const teapot = errorForStatus(418, 'teapot');
    expect(teapot.constructor).toBe(RetailIdApiError);
    expect(errorForStatus(400, null).apiMessage).toBe('Request failed');
    expect(errorForStatus(400, []).apiMessage).toBe('Request failed');
    expect(errorForStatus(400, ['str']).apiMessage).toBe('Request failed');
    expect(errorForStatus(400, { message: 'lower' }).apiMessage).toBe('lower');
    const limited = errorForStatus(429, null, { 'Retry-After': '3' }) as RateLimitError;
    expect(limited).toBeInstanceOf(RateLimitError);
    expect(limited.retryAfterMs).toBe(3_000);
    expect((errorForStatus(429, null, { 'Retry-After': 'soon' }) as RateLimitError).retryAfterMs).toBeNull();
  });

  it('ER-13 Retry-After is read case-insensitively', async () => {
    const { client, sleeps } = makeClient([ok(null, 429, { 'retry-after': '2' }), ok([])]);
    await client.getFacilities();
    expect(sleeps).toEqual([2_000]);
  });

  it('ER-14 Retry-After parsing: 0, negative, fractional, padded, HTTP-date', () => {
    const ms = (value: string) => (errorForStatus(429, null, { 'Retry-After': value }) as RateLimitError).retryAfterMs;
    expect(ms('0')).toBe(0);
    expect(ms('-5')).toBe(0);
    expect(ms('2.5')).toBe(2_500);
    expect(ms(' 3 ')).toBe(3_000);
    expect(ms('Wed, 21 Oct 2026 07:28:00 GMT')).toBeNull();
    expect(ms('Infinity')).toBeNull();
  });

  it('ER-15 message format: "<status> <METHOD> <path>: <message>", "<status>: <message>" without context (D4)', () => {
    expect(errorForStatus(404, { Message: 'nf' }, {}, { method: 'GET', path: '/x' }).message).toBe('404 GET /x: nf');
    expect(errorForStatus(418, 'teapot').message).toBe('418: teapot');
  });

  it('ER-16 maxRetries 0 disables retries', async () => {
    const { client, calls } = makeClient([ok(null, 503)], { maxRetries: 0 });
    await expect(client.getFacilities()).rejects.toThrow(ServerError);
    expect(calls).toHaveLength(1);
  });

  it('ER-17 write-429 safeguard: merge 429, 429, 200 -> 3 calls and success', async () => {
    const { client, calls } = makeClient([ok(null, 429), ok(null, 429), ok({ Ids: [1] })]);
    expect(await client.merge(LICENSE, LABEL, SOURCE_LABEL)).toEqual({ Ids: [1] });
    expect(calls).toHaveLength(3);
  });

  it('ER-18 class hierarchy, names, and instanceof', () => {
    const error = errorForStatus(404, null);
    expect(error).toBeInstanceOf(NotFoundError);
    expect(error).toBeInstanceOf(RetailIdApiError);
    expect(error).toBeInstanceOf(RetailIdError);
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('NotFoundError');
    expect(new RetailIdTimeoutError('GET', '/x', 5, null).name).toBe('RetailIdTimeoutError');
    expect(new RetailIdNetworkError('GET', '/x', new Error('boom')).name).toBe('RetailIdNetworkError');
  });

  it('ER-19 an AbortError from an injected fetch (not the caller) is a network error, not a timeout', async () => {
    const { client, calls } = makeClient([new DOMException('aborted elsewhere', 'AbortError')]);
    await expect(client.getFacilities()).rejects.toThrow(RetailIdNetworkError);
    expect(calls).toHaveLength(1);
  });

  it('ER-20 a timeout while reading the body is a timeout (with retry for reads)', async () => {
    const slowBody = async (): Promise<Response> =>
      ({ status: 200, headers: new Headers(), text: () => Promise.reject(timeoutError()) }) as unknown as Response;
    const { client, calls } = makeClient([slowBody, ok([])]);
    await client.getFacilities();
    expect(calls).toHaveLength(2);
    const write = makeClient([slowBody]);
    await expect(write.client.generate(LICENSE, LABEL, 1)).rejects.toThrow(RetailIdTimeoutError);
  });

  it('ER-21 2xx decoding: empty -> null, non-JSON -> text', async () => {
    const { client } = makeClient([ok(''), new Response('not json', { status: 200 })]);
    expect(await client.getPackage(LICENSE, LABEL)).toBeNull();
    expect(await client.getPackage(LICENSE, LABEL)).toBe('not json');
  });

  it('ER-22 the logger never receives key material (success, retry, timeout, error paths)', async () => {
    const lines: string[] = [];
    const logger = { debug: (m: string) => lines.push(m), info: (m: string) => lines.push(m), warn: (m: string) => lines.push(m) };
    const { client } = makeClient([ok(null, 503), timeoutError(), ok([]), ok({ Message: 'x' }, 401)], { logger });
    await client.getFacilities();
    await expect(client.getFacilities()).rejects.toThrow(AuthenticationError);
    expect(lines.length).toBeGreaterThanOrEqual(4);
    const joined = lines.join('\n');
    for (const secret of [VENDOR_KEY, USER_KEY, Buffer.from(`${VENDOR_KEY}:${USER_KEY}`).toString('base64')]) {
      expect(joined).not.toContain(secret);
    }
    expect(joined).toMatch(/retrying in \d+ ms/);
    expect(joined).toMatch(/timed out/);
  });
});

describe('cancellation and timeouts (native AbortSignal)', () => {
  it('AB-01 an already-aborted signal rejects with its reason and sends nothing', async () => {
    const { client, calls } = makeClient([ok([])]);
    const controller = new AbortController();
    const reason = new Error('caller cancelled');
    controller.abort(reason);
    expect(await rejection(client.getFacilities({ signal: controller.signal }))).toBe(reason);
    expect(calls).toHaveLength(0);
  });

  it('AB-02 aborting mid-request rejects with the caller\'s reason and is never retried', async () => {
    const controller = new AbortController();
    const hang = (init: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init.signal!.addEventListener('abort', () => reject(init.signal!.reason), { once: true });
      });
    const { client, calls } = makeClient([hang, ok([])]);
    const pending = client.getFacilities({ signal: controller.signal });
    controller.abort();
    const error = await rejection(pending);
    expect((error as Error).name).toBe('AbortError');
    expect(calls).toHaveLength(1);
  });

  it('AB-03 aborting during a backoff wait stops the retry loop', async () => {
    const controller = new AbortController();
    const { fetch, calls } = (await import('./helpers.js')).fakeFetch(ok(null, 503), ok([]));
    const client = new RetailIdClient({
      vendorApiKey: VENDOR_KEY,
      userApiKey: USER_KEY,
      stateCode: 'md',
      fetch,
      backoffBaseMs: 60_000,
    });
    const pending = client.getFacilities({ signal: controller.signal });
    await new Promise((resolve) => setTimeout(resolve, 20));
    controller.abort(new Error('stop'));
    expect(((await rejection(pending)) as Error).message).toBe('stop');
    expect(calls).toHaveLength(1);
  });

  it('AB-04 the real per-attempt timeout fires and is classified as a timeout', async () => {
    const hang = (init: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init.signal!.addEventListener('abort', () => reject(init.signal!.reason), { once: true });
      });
    const { client, calls } = makeClient([hang], { timeoutMs: 50, maxRetries: 0 });
    const error = (await rejection(client.getFacilities())) as RetailIdTimeoutError;
    expect(error).toBeInstanceOf(RetailIdTimeoutError);
    expect(error.timeoutMs).toBe(50);
    expect(calls).toHaveLength(1);
  });

  it('AB-05 signal must be an AbortSignal', async () => {
    const { client } = makeClient();
    await expect(client.getFacilities({ signal: {} as never })).rejects.toThrow(TypeError);
  });

  it('AB-06 concurrent calls share no per-request state', async () => {
    const { client, calls } = makeClient([ok({ Eaches: ['A'] }), ok({ Eaches: ['B'] })]);
    const [a, b] = await Promise.all([client.receive(LICENSE, 'L1'), client.receive('999-ABC', 'L2')]);
    expect([a.eaches, b.eaches]).toEqual([['A'], ['B']]);
    expect(calls.map((c) => [c.path, c.query['licenseNumber'], c.headers['Content-Type']])).toEqual([
      ['/retailid/v2/receive/L1', LICENSE, undefined],
      ['/retailid/v2/receive/L2', '999-ABC', undefined],
    ]);
  });
});
