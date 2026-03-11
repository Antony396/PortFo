// Server-side in-memory TTL cache.
// Because this module is loaded once per server process, the Map persists across
// requests and prevents redundant Finnhub / Yahoo / Alpha Vantage calls.

type CacheEntry<T> = { value: T; expiresAt: number };

const store = new Map<string, CacheEntry<unknown>>();

export const TTL = {
  PRICE: 2 * 60 * 1000,          // 2 minutes
  PROFILE: 24 * 60 * 60 * 1000,  // 24 hours
  METRICS: 6 * 60 * 60 * 1000,   // 6 hours
  DCF: 30 * 60 * 1000,           // 30 minutes
} as const;

/**
 * Return the cached value for `key` if it exists and hasn't expired.
 * Otherwise call `fetcher`, store the result, and return it.
 */
export async function getCached<T>(
  key: string,
  ttlMs: number,
  fetcher: () => Promise<T>,
): Promise<T> {
  const entry = store.get(key) as CacheEntry<T> | undefined;
  if (entry && Date.now() < entry.expiresAt) {
    return entry.value;
  }
  const value = await fetcher();
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
  return value;
}
