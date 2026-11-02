import { inspect } from 'node:util';
import { describe, expect, it } from 'vitest';

import { RetailIdClient, RetailIdConfig, RetailIdConfigError } from '../../src/api/index.js';
import { BASIC, USER_KEY, VENDOR_KEY, makeClient, ok } from './helpers.js';

const base = { vendorApiKey: VENDOR_KEY, userApiKey: USER_KEY, fetch: async () => ok([]) };

describe('client setup (Py TestClientSetup / Java ClientSetup)', () => {
  it('SU-01 builds the base URL from a state code, trimmed and lower-cased', () => {
    expect(new RetailIdClient({ ...base, stateCode: 'md' }).baseUrl).toBe('https://api-md.metrc.com');
    expect(new RetailIdClient({ ...base, stateCode: '  MD ' }).baseUrl).toBe('https://api-md.metrc.com');
  });

  it('SU-02 baseUrl overrides stateCode and loses trailing slashes', () => {
    const client = new RetailIdClient({ ...base, stateCode: 'co', baseUrl: 'https://sandbox-api-md.metrc.com///' });
    expect(client.baseUrl).toBe('https://sandbox-api-md.metrc.com');
    expect(new RetailIdClient({ ...base, baseUrl: 'https://proxy.example/metrc/' }).baseUrl).toBe('https://proxy.example/metrc');
  });

  it('SU-03 requires both keys and a location', () => {
    expect(() => new RetailIdClient({ ...base, vendorApiKey: '', stateCode: 'md' })).toThrow(RangeError);
    expect(() => new RetailIdClient({ ...base, userApiKey: '   ', stateCode: 'md' })).toThrow(RangeError);
    expect(() => new RetailIdClient({ ...base, vendorApiKey: 42 as never, stateCode: 'md' })).toThrow(TypeError);
    expect(() => new RetailIdClient({ ...base })).toThrow(/Provide either stateCode or baseUrl/);
    expect(() => new RetailIdClient(undefined as never)).toThrow(TypeError);
  });

  it('SU-04 sends the exact Basic header and never exposes keys', async () => {
    const { client, calls } = makeClient([ok([])]);
    await client.getFacilities();
    expect(calls[0]!.headers['Authorization']).toBe(BASIC);
    expect(calls[0]!.headers['Accept']).toBe('application/json');
    for (const text of [String(client), inspect(client, { showHidden: true, depth: 5 }), JSON.stringify(client), Object.keys(client).join()]) {
      expect(text).not.toContain(VENDOR_KEY);
      expect(text).not.toContain(USER_KEY);
      expect(text).not.toContain(BASIC.slice(6));
    }
  });

  it('SU-05 gives every attempt an AbortSignal bounded by timeoutMs', async () => {
    const { client, calls } = makeClient([ok([])], { timeoutMs: 12_500 });
    await client.getFacilities();
    expect(client.timeoutMs).toBe(12_500);
    expect(calls[0]!.signal).toBeInstanceOf(AbortSignal);
    expect(calls[0]!.signal!.aborted).toBe(false);
  });

  it('SU-06 uses the injected fetch, never the global one (Py close/session, Java transport — adapted)', async () => {
    const original = globalThis.fetch;
    let globalCalls = 0;
    globalThis.fetch = (async () => {
      globalCalls += 1;
      return ok([]);
    }) as typeof fetch;
    try {
      const { client, calls } = makeClient([ok([])]);
      await client.getFacilities();
      expect(calls).toHaveLength(1);
      expect(globalCalls).toBe(0);
    } finally {
      globalThis.fetch = original;
    }
  });

  it('SU-07 rejects invalid URLs, state codes, and numeric options (D5)', () => {
    const md = { ...base, stateCode: 'md' };
    expect(() => new RetailIdClient({ ...base, baseUrl: '' })).toThrow(RangeError);
    expect(() => new RetailIdClient({ ...base, baseUrl: 'not a url' })).toThrow(RangeError);
    expect(() => new RetailIdClient({ ...base, baseUrl: 'ftp://x.example' })).toThrow(/http or https/);
    expect(() => new RetailIdClient({ ...base, baseUrl: 'https://u:p@x.example' })).toThrow(/credentials/);
    expect(() => new RetailIdClient({ ...base, baseUrl: 'https://x.example/?a=1' })).toThrow(/query/);
    expect(() => new RetailIdClient({ ...base, stateCode: 'mdx' })).toThrow(/two-letter/);
    expect(() => new RetailIdClient({ ...md, maxRetries: -1 })).toThrow(RangeError);
    expect(() => new RetailIdClient({ ...md, maxRetries: 1.5 })).toThrow(RangeError);
    expect(() => new RetailIdClient({ ...md, maxRetries: '3' as never })).toThrow(TypeError);
    expect(() => new RetailIdClient({ ...md, timeoutMs: 0 })).toThrow(RangeError);
    expect(() => new RetailIdClient({ ...md, timeoutMs: 2 ** 31 })).toThrow(RangeError);
    expect(() => new RetailIdClient({ ...md, backoffBaseMs: -1 })).toThrow(RangeError);
    expect(() => new RetailIdClient({ ...md, fetch: 'x' as never })).toThrow(TypeError);
    expect(() => new RetailIdClient({ ...md, sleep: 1 as never })).toThrow(TypeError);
    expect(() => new RetailIdClient({ ...md, logger: 'x' as never })).toThrow(TypeError);
    expect(() => new RetailIdClient({ ...md, vendorApiKey: 'a:b' })).toThrow(/must not contain ":"/);
  });

  it('SU-08 defaults to 30 000 ms, 3 retries, 1 000 ms backoff (J defaults)', () => {
    const client = new RetailIdClient({ ...base, stateCode: 'md' });
    expect([client.timeoutMs, client.maxRetries, client.backoffBaseMs]).toEqual([30_000, 3, 1_000]);
  });

  it('SU-09 encodes non-Latin-1 keys as UTF-8 instead of throwing', async () => {
    const { client, calls } = makeClient([ok([])], { vendorApiKey: 'vëndor', userApiKey: 'üser✓' });
    await client.getFacilities();
    expect(calls[0]!.headers['Authorization']).toBe(`Basic ${Buffer.from('vëndor:üser✓', 'utf8').toString('base64')}`);
  });

  it('SU-10 is immutable at runtime and refuses to run in a browser', () => {
    const client = new RetailIdClient({ ...base, stateCode: 'md' });
    expect(Object.isFrozen(client)).toBe(true);
    expect(() => {
      (client as unknown as { baseUrl: string }).baseUrl = 'https://evil.example';
    }).toThrow(TypeError);
    const g = globalThis as { window?: unknown; document?: unknown };
    g.window = {};
    g.document = {};
    try {
      expect(() => new RetailIdClient({ ...base, stateCode: 'md' })).toThrow(/server-side only/);
    } finally {
      delete g.window;
      delete g.document;
    }
  });
});

describe('RetailIdConfig (Py TestConfig / Java Config)', () => {
  const valid = { vendor_api_key: VENDOR_KEY, user_api_key: USER_KEY, state_code: 'co', timeout: 5, max_retries: 1 };

  it('CF-01 maps every field and converts seconds to milliseconds at the boundary', async () => {
    const config = RetailIdConfig.fromObject({ ...valid, backoff_base: 0.5 });
    expect([config.stateCode, config.timeoutSeconds, config.maxRetries, config.backoffBaseSeconds]).toEqual(['co', 5, 1, 0.5]);
    const fetch = async (_input: string, init: RequestInit) => {
      expect((init.headers as Record<string, string>)['Authorization']).toBe(BASIC);
      return ok([]);
    };
    const client = RetailIdClient.fromConfig(config, { fetch });
    expect([client.baseUrl, client.timeoutMs, client.maxRetries, client.backoffBaseMs]).toEqual([
      'https://api-co.metrc.com', 5_000, 1, 500,
    ]);
    await client.getFacilities();
  });

  it('CF-04 overrides win over config values (J builderSettingsOverrideConfig)', () => {
    const client = RetailIdClient.fromConfig(RetailIdConfig.fromObject(valid), { timeoutMs: 99, maxRetries: 0, fetch: async () => ok([]) });
    expect([client.timeoutMs, client.maxRetries]).toEqual([99, 0]);
  });

  it('CF-05 config never exposes keys', () => {
    const config = RetailIdConfig.fromObject(valid);
    for (const text of [String(config), inspect(config, { showHidden: true }), JSON.stringify(config), Object.keys(config).join()]) {
      expect(text).not.toContain(VENDOR_KEY);
      expect(text).not.toContain(USER_KEY);
    }
    expect(config.vendorApiKey).toBe(VENDOR_KEY);
  });

  it.each([
    ['missing vendor key', { user_api_key: 'u', state_code: 'md' }, /missing required keys: vendor_api_key/],
    ['empty user key', { vendor_api_key: 'v', user_api_key: '', state_code: 'md' }, /missing required keys: user_api_key/],
    ['no location', { vendor_api_key: 'v', user_api_key: 'u' }, /state_code or base_url/],
    ['not an object', ['not', 'an', 'object'], /must be a JSON object/],
  ])('CF-06 rejects invalid config: %s (Py test_invalid_config / Java invalidConfig)', (_label, data, message) => {
    expect(() => RetailIdConfig.fromObject(data)).toThrow(RetailIdConfigError);
    expect(() => RetailIdConfig.fromObject(data)).toThrow(message);
  });

  it('CF-08 rejects wrongly-typed values instead of coercing them', () => {
    expect(() => RetailIdConfig.fromObject({ ...valid, timeout: '30' })).toThrow(/timeout must be a number/);
    expect(() => RetailIdConfig.fromObject({ ...valid, timeout: 0 })).toThrow(/greater than 0/);
    expect(() => RetailIdConfig.fromObject({ ...valid, max_retries: 1.5 })).toThrow(/non-negative integer/);
    expect(() => RetailIdConfig.fromObject({ ...valid, vendor_api_key: 123 })).toThrow(/vendor_api_key must be a string, got number/);
    expect(() => RetailIdConfig.fromObject({ ...valid, state_code: 5 })).toThrow(/state_code must be a string/);
  });

  it('CF-11 treats null optional values as defaults (config.example.json uses "base_url": null)', () => {
    const config = RetailIdConfig.fromObject({ vendor_api_key: 'v', user_api_key: 'u', state_code: 'md', base_url: null, timeout: null, max_retries: null, backoff_base: null });
    expect([config.baseUrl, config.timeoutSeconds, config.maxRetries, config.backoffBaseSeconds]).toEqual([null, 30, 3, 1]);
  });

  it('CF-12 the sample config.example.json is valid', async () => {
    const { readFile } = await import('node:fs/promises');
    const example = JSON.parse(await readFile(new URL('../../config.example.json', import.meta.url), 'utf8'));
    expect(RetailIdConfig.fromObject(example).stateCode).toBe('md');
  });
});
