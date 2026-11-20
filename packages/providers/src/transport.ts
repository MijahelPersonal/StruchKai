import { lookup } from 'node:dns/promises';
import type { LookupAddress } from 'node:dns';
import { request } from 'node:https';
import { isIP } from 'node:net';

export class ProviderError extends Error {
  constructor(
    public readonly reason:
      | 'timeout'
      | 'offline'
      | 'rate_limited'
      | 'invalid_response'
      | 'invalid_query'
      | 'not_found'
      | 'unsupported'
      | 'policy',
    public readonly retryAfterSeconds = 0,
  ) {
    super('Fuente externa: ' + reason);
  }
}
export interface WireReply {
  status: number;
  headers: Record<string, string>;
  body: unknown;
}
export type Wire = (
  url: URL,
  body: unknown,
  signal: AbortSignal,
) => Promise<WireReply>;
const allowedHosts = new Set([
  'api.jikan.moe',
  'api.mangadex.org',
  'graphql.anilist.co',
  'kitsu.app',
]);
export function validateProviderUrl(value: string): URL {
  const url = new URL(value);
  if (
    url.protocol !== 'https:' ||
    !allowedHosts.has(url.hostname) ||
    url.port ||
    url.username ||
    url.password ||
    url.hash
  )
    throw new ProviderError('policy');
  return url;
}
export function publicAddress(ip: string): boolean {
  if (isIP(ip) === 6)
    return (
      /^[23][0-9a-f]{3}:/i.test(ip) && !/^2001:(db8|0|10|20):|^2002:/i.test(ip)
    );
  if (isIP(ip) !== 4) return false;
  const [a, b, c] = ip.split('.').map(Number);
  return (
    a > 0 &&
    a < 224 &&
    a !== 10 &&
    a !== 127 &&
    !(a === 169 && b === 254) &&
    !(a === 172 && b >= 16 && b <= 31) &&
    !(a === 192 && (b === 168 || b === 0 || b === 2)) &&
    !(a === 100 && b >= 64 && b <= 127) &&
    !(a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) &&
    !(a === 203 && b === 0 && c === 113)
  );
}
const imageHosts = new Set([
  'cdn.myanimelist.net',
  'uploads.mangadex.org',
  'media.kitsu.app',
  'media.kitsu.io',
  's4.anilist.co',
]);
async function pinnedRequest(
  url: URL,
  body: unknown,
  signal: AbortSignal,
  image = false,
): Promise<WireReply> {
  if (!image) validateProviderUrl(url.href);
  else if (
    url.protocol !== 'https:' ||
    !imageHosts.has(url.hostname) ||
    url.port ||
    url.username ||
    url.password ||
    url.hash
  )
    throw new ProviderError('policy');
  const addresses = await new Promise<LookupAddress[]>((resolve, reject) => {
    signal.throwIfAborted();
    const abort = () => reject(new ProviderError('timeout'));
    signal.addEventListener('abort', abort, { once: true });
    lookup(url.hostname, { all: true })
      .then(resolve, reject)
      .finally(() => signal.removeEventListener('abort', abort));
  });
  if (
    !addresses.length ||
    addresses.some((item) => !publicAddress(item.address))
  )
    throw new ProviderError('policy');
  const address = addresses.find((item) => item.family === 4) ?? addresses[0];
  return new Promise<WireReply>((resolve, reject) => {
    const data = body === undefined ? undefined : JSON.stringify(body);
    const req = request(
      url,
      {
        method: data ? 'POST' : 'GET',
        signal,
        family: address.family,
        lookup: (_host, _options, callback) =>
          callback(null, address.address, address.family),
        headers: {
          'User-Agent': 'StruchKai/0.1 (personal catalog; on-demand)',
          Accept: image
            ? 'image/jpeg,image/png,image/webp'
            : url.hostname === 'kitsu.app'
              ? 'application/vnd.api+json'
              : 'application/json',
          ...(data
            ? {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(data),
              }
            : {}),
        },
      },
      (response) => {
        // Redirects are never followed, including CDN or user supplied URLs.
        let bytes = 0;
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => {
          bytes += chunk.length;
          if (bytes > 4 * 1024 * 1024)
            req.destroy(new ProviderError('invalid_response'));
          else chunks.push(chunk);
        });
        response.on('error', reject);
        response.on('end', () => {
          const headers = Object.fromEntries(
            Object.entries(response.headers).map(([key, value]) => [
              key,
              Array.isArray(value) ? value.join(',') : (value ?? ''),
            ]),
          );
          let parsed: unknown = image ? Buffer.concat(chunks) : null;
          if (!image)
            try {
              parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
            } catch {
              /* Status handling does not require an error body. */
            }
          resolve({
            status: response.statusCode ?? 503,
            headers,
            body: parsed,
          });
        });
      },
    );
    req.on('error', reject);
    req.end(data);
  });
}
export const secureWire: Wire = (url, body, signal) =>
  pinnedRequest(url, body, signal);
export async function fetchProviderCover(
  urlValue: string,
  signal: AbortSignal,
) {
  const reply = await pinnedRequest(new URL(urlValue), undefined, signal, true);
  const contentType = reply.headers['content-type']?.split(';')[0];
  if (
    reply.status !== 200 ||
    !['image/jpeg', 'image/png', 'image/webp'].includes(contentType) ||
    !Buffer.isBuffer(reply.body)
  )
    throw new ProviderError('offline');
  return { bytes: reply.body, contentType };
}
export class ProviderTransport {
  private readonly cache = new Map<
    string,
    { value: unknown; expires: number }
  >();
  private readonly pending = new Map<string, Promise<unknown>>();
  private nextRequest = 0;
  private cooldown = 0;
  private windowStart = 0;
  private count = 0;
  private failures = 0;
  lastSuccess: string | null = null;
  lastFailure: string | null = null;
  lastError: ProviderError['reason'] | null = null;
  constructor(
    readonly minimumIntervalMs: number,
    readonly requestsPerMinute: number,
    private readonly wire: Wire = secureWire,
    private readonly timeoutMs = 8000,
    private readonly now = Date.now,
  ) {}
  status() {
    return {
      lastSuccess: this.lastSuccess,
      lastFailure: this.lastFailure,
      lastError: this.lastError,
      retryAfterSeconds: Math.max(
        0,
        Math.ceil((this.cooldown - this.now()) / 1000),
      ),
    };
  }
  noteError(reason: ProviderError['reason']) {
    this.lastError = reason;
    this.lastFailure = new Date(this.now()).toISOString();
  }
  async json(
    urlValue: string,
    signal: AbortSignal,
    body?: unknown,
    ttlSeconds = 300,
    refresh = false,
  ): Promise<unknown> {
    const url = validateProviderUrl(urlValue);
    const key = url.href + JSON.stringify(body ?? null);
    const cached = this.cache.get(key);
    if (!refresh && cached && cached.expires > this.now())
      return structuredClone(cached.value);
    const active = this.pending.get(key);
    if (active) return structuredClone(await active);
    const result = this.perform(url, signal, body).then((value) => {
      if (this.cache.size >= 100)
        this.cache.delete(this.cache.keys().next().value!);
      this.cache.set(key, { value, expires: this.now() + ttlSeconds * 1000 });
      return value;
    });
    this.pending.set(key, result);
    try {
      return structuredClone(await result);
    } finally {
      this.pending.delete(key);
    }
  }
  private async perform(
    url: URL,
    caller: AbortSignal,
    body: unknown,
  ): Promise<unknown> {
    const signal = AbortSignal.any([
      caller,
      AbortSignal.timeout(this.timeoutMs),
    ]);
    try {
      for (let attempt = 0; attempt < 2; attempt++) {
        signal.throwIfAborted();
        const now = this.now();
        if (now < this.cooldown)
          throw new ProviderError(
            'rate_limited',
            Math.ceil((this.cooldown - now) / 1000),
          );
        if (now - this.windowStart >= 60000) {
          this.windowStart = now;
          this.count = 0;
        }
        if (++this.count > this.requestsPerMinute)
          throw new ProviderError('rate_limited', 60);
        const delay = Math.max(0, this.nextRequest - now);
        if (delay > 4000)
          throw new ProviderError('rate_limited', Math.ceil(delay / 1000));
        this.nextRequest =
          Math.max(now, this.nextRequest) + this.minimumIntervalMs;
        if (delay) await this.pause(delay, signal);
        let reply: WireReply;
        try {
          reply = await this.bounded(
            () => this.wire(url, body, signal),
            signal,
          );
        } catch (error) {
          if (signal.aborted || error instanceof ProviderError || attempt === 1)
            throw error;
          await this.pause(250, signal);
          continue;
        }
        if (reply.status === 429) {
          const raw = reply.headers['retry-after'];
          const seconds =
            raw && /^\d+$/.test(raw)
              ? Number(raw)
              : raw
                ? Math.ceil((Date.parse(raw) - now) / 1000)
                : 60;
          this.cooldown =
            now + Math.max(1, Number.isFinite(seconds) ? seconds : 60) * 1000;
          throw new ProviderError(
            'rate_limited',
            Math.ceil((this.cooldown - now) / 1000),
          );
        }
        if (reply.status === 404) throw new ProviderError('not_found');
        if (reply.status === 400 || reply.status === 422)
          throw new ProviderError('invalid_query');
        if (reply.status >= 500 && attempt === 0) {
          await this.pause(250, signal);
          continue;
        }
        if (reply.status < 200 || reply.status >= 300)
          throw new ProviderError('offline');
        if (reply.body === null || typeof reply.body !== 'object')
          throw new ProviderError('invalid_response');
        this.lastSuccess = new Date(this.now()).toISOString();
        this.lastError = null;
        this.failures = 0;
        return reply.body;
      }
      throw new ProviderError('offline');
    } catch (error) {
      const failure =
        error instanceof ProviderError
          ? error
          : new ProviderError(signal.aborted ? 'timeout' : 'offline');
      if (failure.reason === 'invalid_query' || failure.reason === 'not_found')
        throw failure;
      this.lastFailure = new Date(this.now()).toISOString();
      this.lastError = failure.reason;
      if (++this.failures >= 3)
        this.cooldown = Math.max(this.cooldown, this.now() + 30000);
      throw failure;
    }
  }
  private pause(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      signal.throwIfAborted();
      const abort = () => {
        clearTimeout(timer);
        reject(new ProviderError('timeout'));
      };
      const timer = setTimeout(() => {
        signal.removeEventListener('abort', abort);
        resolve();
      }, ms);
      signal.addEventListener('abort', abort, { once: true });
    });
  }
  private bounded<T>(run: () => Promise<T>, signal: AbortSignal): Promise<T> {
    return new Promise((resolve, reject) => {
      const abort = () => reject(new ProviderError('timeout'));
      signal.throwIfAborted();
      signal.addEventListener('abort', abort, { once: true });
      run()
        .then(resolve, reject)
        .finally(() => signal.removeEventListener('abort', abort));
    });
  }
}
