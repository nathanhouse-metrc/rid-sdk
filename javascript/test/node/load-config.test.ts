import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { RetailIdConfigError } from '../../src/api/index.js';
import { createClientFromConfigFile, loadConfig } from '../../src/node/index.js';
import { BASIC, USER_KEY, VENDOR_KEY, ok } from '../api/helpers.js';

let dir: string;
const savedEnv = process.env['RETAILID_CONFIG'];
const savedCwd = process.cwd();

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'retailid-config-test-'));
  delete process.env['RETAILID_CONFIG'];
});
afterEach(async () => {
  process.chdir(savedCwd);
  if (savedEnv === undefined) delete process.env['RETAILID_CONFIG'];
  else process.env['RETAILID_CONFIG'] = savedEnv;
  await rm(dir, { recursive: true, force: true });
});

const write = async (name: string, data: unknown): Promise<string> => {
  const path = join(dir, name);
  await writeFile(path, typeof data === 'string' ? data : JSON.stringify(data), 'utf8');
  return path;
};

describe('loadConfig / createClientFromConfigFile (Py TestConfig / Java Config)', () => {
  it('CF-02 builds a client from a file and sends the Basic header from it', async () => {
    const path = await write('config.json', { vendor_api_key: VENDOR_KEY, user_api_key: USER_KEY, state_code: 'co', timeout: 5, max_retries: 1 });
    let auth = '';
    const client = await createClientFromConfigFile(path, {
      fetch: async (_input, init) => {
        auth = (init.headers as Record<string, string>)['Authorization'] ?? '';
        return ok([]);
      },
    });
    expect([client.baseUrl, client.timeoutMs, client.maxRetries]).toEqual(['https://api-co.metrc.com', 5_000, 1]);
    await client.getFacilities();
    expect(auth).toBe(BASIC);
  });

  it('CF-03 reads $RETAILID_CONFIG when no path is given; base_url is honoured', async () => {
    const path = await write('env.json', { vendor_api_key: 'v', user_api_key: 'u', base_url: 'https://sandbox.example/' });
    process.env['RETAILID_CONFIG'] = path;
    const config = await loadConfig();
    expect(config.baseUrl).toBe('https://sandbox.example/');
    const client = await createClientFromConfigFile(undefined, { fetch: async () => ok([]) });
    expect(client.baseUrl).toBe('https://sandbox.example');
  });

  it('CF-07 reports missing and malformed files', async () => {
    await expect(loadConfig(join(dir, 'nope.json'))).rejects.toThrow(/Config file not found/);
    await expect(loadConfig(await write('bad.json', '{'))).rejects.toThrow(/not valid JSON/);
    await expect(loadConfig(await write('array.json', [1, 2]))).rejects.toThrow(/must contain a JSON object/);
    const error = await loadConfig(join(dir, 'nope.json')).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RetailIdConfigError);
    expect((error as Error).cause).toBeDefined();
  });

  it('CF-09 falls back to ./config.json when $RETAILID_CONFIG is empty', async () => {
    await write('config.json', { vendor_api_key: 'v', user_api_key: 'u', state_code: 'ny' });
    process.env['RETAILID_CONFIG'] = '';
    process.chdir(dir);
    expect((await loadConfig()).stateCode).toBe('ny');
  });

  it('CF-10 resolves relative paths against the working directory and accepts file URLs', async () => {
    await write('rel.json', { vendor_api_key: 'v', user_api_key: 'u', state_code: 'mi' });
    process.chdir(dir);
    expect((await loadConfig('rel.json')).stateCode).toBe('mi');
    expect((await loadConfig(pathToFileURL(join(dir, 'rel.json')))).stateCode).toBe('mi');
    await expect(loadConfig('' as never)).rejects.toThrow(TypeError);
  });

  it('CF-13 accepts a UTF-8 BOM (common when files are saved by Windows editors)', async () => {
    const path = await write('bom.json', `\uFEFF${JSON.stringify({ vendor_api_key: 'v', user_api_key: 'u', state_code: 'md' })}`);
    expect((await loadConfig(path)).stateCode).toBe('md');
  });

  it('CF-14 error messages never contain key values', async () => {
    const path = await write('typed.json', { vendor_api_key: 'SECRET-VENDOR', user_api_key: 'SECRET-USER', state_code: 5 });
    const error = (await loadConfig(path).catch((e: unknown) => e)) as Error;
    expect(error.message).toMatch(/state_code must be a string/);
    expect(error.message).not.toContain('SECRET');
  });

  it('CF-15 node errors share class identity with @metrc/retailid/api', async () => {
    const error = await loadConfig(join(dir, 'nope.json')).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RetailIdConfigError);
  });
});
