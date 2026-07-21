import { describe, expect, it, vi } from 'vitest';
import { ApiRequestError, createApiClient } from './api.js';

const ctx = { apiBaseUrl: 'http://api.test', apiToken: 'scoped-tok' };

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('createApiClient', () => {
  it('GETs with the base URL joined and the Bearer token attached', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, { ok: true }));
    const client = createApiClient(ctx, fetchImpl);
    const out = await client.getJson('/plants/p1/care');
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('http://api.test/plants/p1/care');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer scoped-tok');
    expect(init.method).toBe('GET');
    expect(out).toEqual({ ok: true });
  });

  it('POSTs a JSON body with content-type set (the proposal mediator)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(201, { id: 'prop-1', status: 'PENDING' }));
    const client = createApiClient(ctx, fetchImpl);
    const out = await client.postJson('/plants/p1/diagnose/sessions/s1/proposals', { summary: 's', operations: [] });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('http://api.test/plants/p1/diagnose/sessions/s1/proposals');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer scoped-tok');
    expect((init.headers as Record<string, string>)['content-type']).toBe('application/json');
    expect(JSON.parse(init.body as string)).toEqual({ summary: 's', operations: [] });
    expect(out).toEqual({ id: 'prop-1', status: 'PENDING' });
  });

  // An agent's token is 403 on every domain-mutating endpoint, so a put/patch/delete method is not
  // merely unused — having one invites a call that can only ever fail. Pin the surface.
  it('exposes ONLY the read + propose surface — no direct-write method survives', () => {
    const client = createApiClient(ctx, vi.fn());
    expect(Object.keys(client).sort()).toEqual(['getJson', 'postJson']);
  });

  it('throws ApiRequestError carrying the API status + body VERBATIM on a non-2xx', async () => {
    // Use mockImplementation (NOT mockResolvedValue) so EACH call gets a FRESH Response — a Response body can
    // only be read once, so a shared instance would be consumed by the first assertion and throw `bodyUsed`
    // on the second, masking the ApiRequestError we mean to assert.
    const fetchImpl = vi.fn().mockImplementation(() =>
      Promise.resolve(jsonResponse(400, { statusCode: 400, message: 'operations overlap on frequency:WATER' })),
    );
    const client = createApiClient(ctx, fetchImpl);
    await expect(client.postJson('/plants/p1/diagnose/sessions/s1/proposals', {})).rejects.toMatchObject({
      status: 400,
      body: { statusCode: 400, message: 'operations overlap on frequency:WATER' },
    });
    await expect(client.postJson('/plants/p1/diagnose/sessions/s1/proposals', {})).rejects.toBeInstanceOf(ApiRequestError);
  });

  // A 409 is the propose endpoint's contractual answer to "a newer proposal superseded yours" and it
  // carries a terminal `status` the agent must be able to read. Prove the body survives.
  it('surfaces a 409 conflict body so the agent can report the terminal status', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(409, { message: 'no longer pending', status: 'EXPIRED' }));
    const client = createApiClient(ctx, fetchImpl);
    await expect(client.postJson('/plants/p1/diagnose/sessions/s1/proposals', {})).rejects.toMatchObject({
      status: 409,
      body: { status: 'EXPIRED' },
    });
  });

  it('never hardcodes a URL — it uses ctx.apiBaseUrl', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, {}));
    const client = createApiClient({ ...ctx, apiBaseUrl: 'http://other:5501' }, fetchImpl);
    await client.getJson('/plants/p1/care');
    expect(fetchImpl.mock.calls[0][0]).toBe('http://other:5501/plants/p1/care');
  });
});
