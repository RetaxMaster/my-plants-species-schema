export type FetchImpl = typeof fetch;

/** The two fields the client needs. The agent's own context type structurally satisfies this. */
export interface ApiCredentials { apiBaseUrl: string; apiToken: string; }

/** A non-2xx from the API, carrying the parsed body VERBATIM so a tool can print the API's own typed
 * error instead of masking it. */
export class ApiRequestError extends Error {
  constructor(readonly status: number, readonly body: unknown, readonly path: string) {
    super(`API ${status} on ${path}: ${typeof body === 'string' ? body : JSON.stringify(body)}`);
    this.name = 'ApiRequestError';
  }
}

async function readBody(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return text; }
}

export interface ApiClient {
  getJson<T = unknown>(path: string): Promise<T>;
  postJson<T = unknown>(path: string, body: unknown): Promise<T>;
}

/** Thin client: base URL + scoped Bearer token from the injected context. Never hardcodes a URL or a
 * credential. `fetchImpl` is injectable so tests run without a network. There is deliberately no
 * put/patch/delete: an agent token is 403 on every domain-mutating endpoint, and the ONE write it has is
 * the proposal mediator, which is a POST. */
export function createApiClient(ctx: ApiCredentials, fetchImpl: FetchImpl = fetch): ApiClient {
  const base = ctx.apiBaseUrl.replace(/\/$/, '');
  const auth = { Authorization: `Bearer ${ctx.apiToken}` };

  async function request<T>(path: string, init: RequestInit): Promise<T> {
    const res = await fetchImpl(`${base}${path}`, init);
    const body = await readBody(res);
    if (!res.ok) throw new ApiRequestError(res.status, body, path);
    return body as T;
  }

  return {
    getJson: (path) => request(path, { method: 'GET', headers: { ...auth } }),
    postJson: (path, body) =>
      request(path, { method: 'POST', headers: { ...auth, 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  };
}
