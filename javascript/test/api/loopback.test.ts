// Real HTTP over 127.0.0.1 with the real global fetch — no mocks. Java parity:
// DefaultTransport.endToEnd. No external network access.

import { createServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';

import { RetailIdClient, RetailIdNetworkError, RetailIdTimeoutError } from '../../src/api/index.js';
import { BASIC, LABEL, LICENSE, USER_KEY, VENDOR_KEY, rejection } from './helpers.js';

type Handler = (req: IncomingMessage, res: ServerResponse, body: string) => void;
const servers: Server[] = [];

async function serve(handler: Handler): Promise<string> {
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => handler(req, res, body));
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

afterEach(async () => {
  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});

const client = (baseUrl: string, extra: { timeoutMs?: number; maxRetries?: number } = {}) =>
  new RetailIdClient({ vendorApiKey: VENDOR_KEY, userApiKey: USER_KEY, baseUrl, ...extra });

describe('loopback (real node:http + real fetch)', () => {
  it('LB-01 generate puts the exact request on the wire (J endToEnd)', async () => {
    let seen = '';
    const baseUrl = await serve((req, res, body) => {
      seen = [req.method, req.url, req.headers.authorization, req.headers['content-type'], req.headers.accept, body].join(' | ');
      res.setHeader('Content-Type', 'application/json');
      res.end('{"IssuanceId":"xyz"}');
    });
    expect((await client(baseUrl, { timeoutMs: 5_000 }).generate(LICENSE, LABEL, 2)).issuanceId).toBe('xyz');
    expect(seen).toBe(
      `POST | /retailid/v2/generate?licenseNumber=${LICENSE} | ${BASIC} | application/json | application/json | ` +
        `{"PackageLabel":"${LABEL}","Quantity":2}`,
    );
  });

  it('LB-02 a slow server trips the real timeout -> RetailIdTimeoutError', async () => {
    const baseUrl = await serve(() => {
      /* never respond */
    });
    const error = (await rejection(client(baseUrl, { timeoutMs: 100, maxRetries: 0 }).getFacilities())) as RetailIdTimeoutError;
    expect(error).toBeInstanceOf(RetailIdTimeoutError);
    expect(error.timeoutMs).toBe(100);
  });

  it('LB-03 Authorization survives same-origin redirects and is dropped on cross-origin redirects', async () => {
    const received: Record<string, string> = {};
    const other = await serve((req, res) => {
      received['cross'] = req.headers.authorization ?? 'NONE';
      res.end('[]');
    });
    const baseUrl = await serve((req, res) => {
      if (req.url!.startsWith('/facilities/v2/')) {
        res.writeHead(302, { Location: '/same' });
        res.end();
      } else if (req.url!.startsWith('/same')) {
        received['same'] = req.headers.authorization ?? 'NONE';
        res.writeHead(302, { Location: `${other}/elsewhere` });
        res.end();
      }
    });
    expect(await client(baseUrl, { timeoutMs: 5_000 }).getFacilities()).toEqual([]);
    expect(received).toEqual({ same: BASIC, cross: 'NONE' });
  });

  it('LB-04 connection refused -> RetailIdNetworkError with the original cause, not retried', async () => {
    const baseUrl = await serve(() => undefined);
    const server = servers.pop()!;
    await new Promise((resolve) => server.close(resolve));
    const error = (await rejection(client(baseUrl, { timeoutMs: 5_000 }).getFacilities())) as RetailIdNetworkError;
    expect(error).toBeInstanceOf(RetailIdNetworkError);
    expect(error.cause).toBeInstanceOf(TypeError);
    expect(error.message).toMatch(/^GET \/facilities\/v2\/ failed: fetch failed/);
  });

  it('LB-05 a real 429 with Retry-After: 0 is retried and then succeeds', async () => {
    let calls = 0;
    const baseUrl = await serve((_req, res) => {
      calls += 1;
      if (calls === 1) {
        res.writeHead(429, { 'Retry-After': '0' });
        res.end('{"Message":"slow down"}');
      } else res.end('{"Data":[{"Id":1}]}');
    });
    expect(await client(baseUrl, { timeoutMs: 5_000 }).getFacilities()).toEqual([{ Id: 1 }]);
    expect(calls).toBe(2);
  });
});
