// Share only requests that are currently in flight. Settled data is never cached.
// Each caller owns its cancellation; leaving one page cannot cancel another.
export function createPendingRequests(maxEntries = 128) {
  const pending = new Map();
  const aborted = () => Object.assign(new Error('Request canceled.'), { name: 'AbortError' });
  function invalidate(scope) {
    for (const [key, entry] of pending) if (entry.scope === scope) pending.delete(key);
  }
  function run(scope, key, load, signal) {
    if (signal?.aborted) return Promise.reject(aborted());
    let entry = pending.get(key);
    if (!entry || entry.controller.signal.aborted) {
      const controller = new AbortController();
      entry = { scope, controller, subscribers: 0 };
      const current = entry;
      current.promise = Promise.resolve().then(() => load(controller.signal)).finally(() => {
        if (pending.get(key) === current) pending.delete(key);
      });
      // Overflow requests still run normally, without growing the shared registry.
      if (pending.size < maxEntries) pending.set(key, entry);
    }
    const current = entry;
    current.subscribers++;
    return new Promise((resolve, reject) => {
      let settled = false;
      function finish(callback, value) {
        if (settled) return;
        settled = true;
        signal?.removeEventListener('abort', cancel);
        current.subscribers--;
        // A remount in the same turn may attach before we cancel unused work.
        Promise.resolve().then(() => {
          if (current.subscribers === 0) current.controller.abort();
        });
        callback(value);
      }
      function cancel() { finish(reject, aborted()); }
      signal?.addEventListener('abort', cancel, { once: true });
      current.promise.then(value => finish(resolve, value), error => finish(reject, error));
    });
  }
  return { run, invalidate };
}
