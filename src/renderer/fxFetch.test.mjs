import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchRatesFromFrankfurter } from './fxFetch.mjs';

afterEach(() => {
  vi.restoreAllMocks();
});

function mockResponse({ ok = true, status = 200, json, text }) {
  return {
    ok,
    status,
    json: json ?? (async () => ({})),
    text: text ?? (async () => ''),
  };
}

describe('fetchRatesFromFrankfurter', () => {
  it('builds the Frankfurter URL from mixed currencies and omits USD', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      mockResponse({ json: async () => ({ rates: { EUR: 0.9, JPY: 150, CAD: 1.3 } }) }),
    );

    await fetchRatesFromFrankfurter(['USD', 'EUR', 'JPY', 'CAD'], undefined);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0][0]).toBe('https://api.frankfurter.app/latest?from=USD&to=EUR,JPY,CAD');
    expect(fetchSpy.mock.calls[0][1]).toEqual({ signal: undefined });
  });

  it('returns parsed rates with USD set to 1 and metadata', async () => {
    const fetchedAt = '2026-05-25T12:34:56.000Z';
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      mockResponse({ json: async () => ({ rates: { EUR: 0.91, GBP: 0.79 } }) }),
    );
    vi.spyOn(Date.prototype, 'toISOString').mockReturnValue(fetchedAt);

    const result = await fetchRatesFromFrankfurter(['EUR', 'GBP'], undefined);

    expect(result).toEqual({
      rates: { USD: 1, EUR: 0.91, GBP: 0.79 },
      fetchedAt,
      source: 'frankfurter.app',
    });
  });

  it('throws on HTTP errors', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      mockResponse({ ok: false, status: 503, text: async () => 'service unavailable' }),
    );

    await expect(fetchRatesFromFrankfurter(['EUR'], undefined)).rejects.toThrow('Frankfurter API request failed with status 503');
  });

  it('throws when JSON is malformed', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => { throw new Error('Unexpected token'); },
      text: async () => 'not json',
    });

    await expect(fetchRatesFromFrankfurter(['EUR'], undefined)).rejects.toThrow('Unexpected token');
  });

  it('propagates abort-driven fetch failures', async () => {
    const controller = new AbortController();
    const abortError = new Error('The operation was aborted');
    abortError.name = 'AbortError';

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
      expect(init?.signal).toBe(controller.signal);
      throw abortError;
    });

    await expect(fetchRatesFromFrankfurter(['EUR'], controller.signal)).rejects.toThrow('The operation was aborted');
  });

  it('throws when rates field is missing', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      mockResponse({ json: async () => ({ foo: 'bar' }) }),
    );

    await expect(fetchRatesFromFrankfurter(['EUR'], undefined)).rejects.toThrow('Frankfurter API response was missing rates');
  });

  // Documentation-as-test (PR #61 review): when called with no non-USD
  // currencies, the fetcher emits an unfiltered URL ('?from=USD' with no
  // '&to='), which Frankfurter answers with all ~33 supported currencies.
  // This is by design — the fetcher is a thin wrapper. Callers are
  // responsible for guarding against the empty-currency case so the store
  // does not silently inject 30+ unwanted currencies into the user's rates
  // table. See refreshRatesNow in store.jsx for the guard.
  it('emits unfiltered URL when called with no non-USD currencies (callers must guard)', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      mockResponse({ json: async () => ({ rates: { EUR: 0.9 } }) }),
    );

    await fetchRatesFromFrankfurter([], undefined);
    expect(fetchSpy.mock.calls[0][0]).toBe('https://api.frankfurter.app/latest?from=USD');

    fetchSpy.mockClear();
    await fetchRatesFromFrankfurter(['USD'], undefined);
    expect(fetchSpy.mock.calls[0][0]).toBe('https://api.frankfurter.app/latest?from=USD');
  });
});
