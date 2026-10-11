// Vitest setup: in-memory localStorage BEFORE any store module loads, so the
// zustand persist layer hydrates cleanly in Node. Backing map is exposed for
// per-test resets via globalThis.__testLocalStorage.
const backing = new Map<string, string>();

(globalThis as unknown as { __testLocalStorage: Map<string, string> }).__testLocalStorage = backing;

(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (key: string) => backing.get(key) ?? null,
  setItem: (key: string, value: string) => void backing.set(key, value),
  removeItem: (key: string) => void backing.delete(key),
  clear: () => backing.clear(),
  key: (index: number) => [...backing.keys()][index] ?? null,
  get length() {
    return backing.size;
  },
} as unknown as Storage;
