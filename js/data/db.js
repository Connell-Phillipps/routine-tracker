// Small promise wrapper over IndexedDB. Schema changes go in MIGRATIONS, one entry per
// version, so an installed app upgrades its data in place.

export const DB_NAME = 'routine-tracker';
export const DB_VERSION = 1;

export const STORES = {
  kv: { keyPath: 'key' }, // settings and app flags
  days: { keyPath: 'date' },
  lifts: { keyPath: 'id', indexes: ['date', 'exerciseId'] },
  exercises: { keyPath: 'id' },
  tests: { keyPath: 'id', indexes: ['date'] },
  food: { keyPath: 'id', indexes: ['date'] },
  chores: { keyPath: 'id' },
  choreLog: { keyPath: 'id', indexes: ['date'] },
  overrides: { keyPath: 'exerciseId' },
};

const MIGRATIONS = {
  1(db) {
    for (const [name, def] of Object.entries(STORES)) {
      const store = db.createObjectStore(name, { keyPath: def.keyPath });
      for (const idx of def.indexes || []) store.createIndex(idx, idx);
    }
  },
};

const promisify = (req) => new Promise((resolve, reject) => {
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

export function newId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function openRaw(name) {
  const req = indexedDB.open(name, DB_VERSION);
  req.onupgradeneeded = (event) => {
    for (let v = event.oldVersion + 1; v <= DB_VERSION; v += 1) MIGRATIONS[v](req.result);
  };
  req.onblocked = () => console.warn('Database upgrade blocked by another open tab.');
  return promisify(req);
}

export async function openDB(name = DB_NAME) {
  return createStore(name, await openRaw(name));
}

const done = (t) => new Promise((resolve, reject) => {
  t.oncomplete = () => resolve();
  t.onerror = () => reject(t.error);
  t.onabort = () => reject(t.error || new Error('Transaction aborted'));
});

function createStore(name, initial) {
  let db = initial;
  let closedByUs = false;
  const watch = (conn) => {
    conn.onversionchange = () => conn.close(); // let a newer tab upgrade
    return conn;
  };
  watch(db);

  /**
   * Runs fn(transaction). iOS can close the connection while the app is in the
   * background; then the first call fails with InvalidStateError, so reopen once and retry.
   */
  async function run(names, mode, fn) {
    try {
      return await fn(db.transaction(names, mode));
    } catch (err) {
      if (closedByUs || err?.name !== 'InvalidStateError') throw err;
      db = watch(await openRaw(name));
      return fn(db.transaction(names, mode));
    }
  }

  return {
    get: (store, key) => run(store, 'readonly', (t) => promisify(t.objectStore(store).get(key))),
    getAll: (store) => run(store, 'readonly', (t) => promisify(t.objectStore(store).getAll())),
    put: (store, value) => run(store, 'readwrite', async (t) => {
      t.objectStore(store).put(value);
      await done(t);
      return value;
    }),
    delete: (store, key) => run(store, 'readwrite', async (t) => {
      t.objectStore(store).delete(key);
      await done(t);
    }),
    bulkPut: (store, values) => run(store, 'readwrite', async (t) => {
      const os = t.objectStore(store);
      for (const v of values) os.put(v);
      await done(t);
    }),
    /** Every store's records, for export. */
    dumpAll: () => run(Object.keys(STORES), 'readonly', async (t) => {
      const out = {};
      await Promise.all(Object.keys(STORES).map(async (n) => { out[n] = await promisify(t.objectStore(n).getAll()); }));
      return out;
    }),
    /** Replaces all data in one transaction, so a failed import leaves the old data intact. */
    replaceAll: (data) => run(Object.keys(STORES), 'readwrite', async (t) => {
      for (const n of Object.keys(STORES)) {
        const os = t.objectStore(n);
        os.clear();
        for (const v of data[n] || []) os.put(v);
      }
      await done(t);
    }),
    close: () => { closedByUs = true; db.close(); },
  };
}

export function deleteDB(name) {
  return promisify(indexedDB.deleteDatabase(name));
}
