type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

const store = new Map<string, CacheEntry<unknown>>();

export const readCache = <T>(key: string): T | null => {
  const entry = store.get(key);
  if (!entry) {
    return null;
  }

  if (entry.expiresAt < Date.now()) {
    store.delete(key);
    return null;
  }

  return entry.value as T;
};

export const writeCache = <T>(key: string, value: T, ttlMs: number) => {
  store.set(key, {
    value,
    expiresAt: Date.now() + ttlMs,
  });
};

export const clearCache = (prefix?: string) => {
  if (!prefix) {
    store.clear();
    return;
  }

  for (const key of store.keys()) {
    if (key.startsWith(prefix)) {
      store.delete(key);
    }
  }
};
