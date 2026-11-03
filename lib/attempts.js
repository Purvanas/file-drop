function createAttemptLimiter({ maxAttempts, windowMs, now = () => Date.now() }) {
  const entries = new Map();

  function attempt(key) {
    const timestamp = now();
    const current = entries.get(key);
    const entry = !current || timestamp > current.expiresAt
      ? { count: 1, expiresAt: timestamp + windowMs }
      : { count: current.count + 1, expiresAt: current.expiresAt };
    entries.set(key, entry);
    return entry.count <= maxAttempts;
  }

  function clear(key) { entries.delete(key); }

  function prune() {
    const timestamp = now();
    for (const [key, entry] of entries) {
      if (timestamp > entry.expiresAt) entries.delete(key);
    }
  }

  return { attempt, clear, prune, get size() { return entries.size; } };
}

module.exports = { createAttemptLimiter };
