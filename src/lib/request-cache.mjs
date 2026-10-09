// Small, component-owned cache. Never persists private data to browser storage.
export function createRequestCache({ ttl = 60000, maxEntries = 30, now = Date.now } = {}) {
  const values = new Map();
  const pending = new Map();
  let generation = 0;
  return {
    async read(key, loader) {
      const cached = values.get(key);
      if (cached && cached.expires > now()) return cached.value;
      if (pending.has(key)) return pending.get(key);
      const version = generation;
      const request = Promise.resolve().then(loader).then(value => {
        if (version === generation) {
          values.delete(key);
          values.set(key, { value, expires: now() + ttl });
          while (values.size > maxEntries) values.delete(values.keys().next().value);
        }
        return value;
      }).finally(() => { if (pending.get(key) === request) pending.delete(key); });
      pending.set(key, request);
      return request;
    },
    clear() { generation++; values.clear(); pending.clear(); },
  };
}
