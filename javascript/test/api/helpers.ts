// Shared test harness — the JS equivalent of Python's FakeSession and Java's
// FakeTransport. Records every request the client sends and replays queued
// responses (or throws queued errors). No network access.

import { RetailIdClient } from '../../src/api/index.js';
import type { RetailIdClientOptions } from '../../src/api/index.js';

// Fixture values from python/tests/test_api.py (integration-guide examples).
// Credentials are obviously fake placeholders.
export const LICENSE = '837-XYZ';
export const LABEL = '1A4060300007777000000001';
export const SOURCE_LABEL = '1A4080300007747000000001';
export const QR_A = 'https://1a4.com/ZScU6dsbUk98nsJEAA';
export const QR_B = 'https://1a4.com/ZScU6dsbUk98nsJEAB';
export const QR_C = 'https://1a4.com/ZScU6dsbUk98nsJEAC';
export const VENDOR_KEY = 'vendor-key';
export const USER_KEY = 'user-key';
export const BASIC = `Basic ${Buffer.from(`${VENDOR_KEY}:${USER_KEY}`).toString('base64')}`;

export interface RecordedCall {
  method: string;
  url: string;
  path: string;
  query: Record<string, string>;
  rawQuery: string;
  headers: Record<string, string>;
  bodyText: string | undefined;
  json: unknown;
  signal: AbortSignal | undefined;
}

export type Reply = Response | Error | ((init: RequestInit) => Promise<Response>);

/** A JSON (or empty) response. */
export function ok(payload?: unknown, status = 200, headers: Record<string, string> = {}): Response {
  const body = payload === undefined || payload === null ? '' : typeof payload === 'string' ? payload : JSON.stringify(payload);
  return new Response(body, { status, headers });
}

/** A DOMException like the one AbortSignal.timeout produces. */
export const timeoutError = (): DOMException => new DOMException('The operation was aborted due to timeout', 'TimeoutError');

/** A fetch network failure shaped like undici's ("fetch failed" with a system-error cause). */
export function networkError(code = 'ECONNRESET'): TypeError {
  return new TypeError('fetch failed', { cause: Object.assign(new Error(`read ${code}`), { code }) });
}

export function fakeFetch(...replies: Reply[]) {
  const queue = [...replies];
  const calls: RecordedCall[] = [];
  const fetch = async (input: string, init: RequestInit): Promise<Response> => {
    const url = new URL(input);
    const headers = Object.fromEntries(Object.entries((init.headers ?? {}) as Record<string, string>));
    const bodyText = typeof init.body === 'string' ? init.body : undefined;
    calls.push({
      method: String(init.method),
      url: input,
      path: url.pathname,
      query: Object.fromEntries(url.searchParams),
      rawQuery: url.search,
      headers,
      bodyText,
      json: bodyText === undefined ? undefined : JSON.parse(bodyText),
      signal: init.signal ?? undefined,
    });
    const next = queue.shift();
    if (next === undefined) throw new Error('fakeFetch: unexpected extra request');
    if (next instanceof Error) throw next;
    if (typeof next === 'function') return next(init);
    return next;
  };
  return { fetch, calls, remaining: () => queue.length };
}

export function makeClient(replies: Reply[] = [], options: Partial<RetailIdClientOptions> = {}) {
  const { fetch, calls, remaining } = fakeFetch(...replies);
  const sleeps: number[] = [];
  const client = new RetailIdClient({
    vendorApiKey: VENDOR_KEY,
    userApiKey: USER_KEY,
    stateCode: 'md',
    fetch,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    ...options,
  });
  return { client, calls, sleeps, remaining };
}

/** Awaits a promise expected to reject and returns the rejection. */
export async function rejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('expected the promise to reject');
}
