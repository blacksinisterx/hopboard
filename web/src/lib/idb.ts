// Tiny IndexedDB key-value store. Needed because CryptoKey objects (non-extractable identity keys) can only be
// persisted through structured clone, not localStorage.

const open = () => new Promise<IDBDatabase>((res, rej) => {
  const r = indexedDB.open('hopboard', 1);
  r.onupgradeneeded = () => r.result.createObjectStore('kv');
  r.onsuccess = () => res(r.result);
  r.onerror = () => rej(r.error);
});

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise<T>((res, rej) => {
    const req = fn(db.transaction('kv', mode).objectStore('kv'));
    req.onsuccess = () => { res(req.result); db.close(); };
    req.onerror = () => { rej(req.error); db.close(); };
  });
}

export const idbGet = <T>(k: string) => run<T | undefined>('readonly', (s) => s.get(k));
export const idbSet = (k: string, v: unknown) => run('readwrite', (s) => s.put(v, k)).then(() => undefined);
export const idbDel = (k: string) => run('readwrite', (s) => s.delete(k)).then(() => undefined);
