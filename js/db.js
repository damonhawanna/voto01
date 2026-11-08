/* ============================================================
   db.js — capa mínima sobre IndexedDB.
   Almacenes: kv (configuración), voters (padrón), candidates,
   blocks (cadena) y audit (bitácora).
   ============================================================ */

const DB_NAME = 'voto-seguro';
const DB_VERSION = 1;
const STORES = {
  kv: { keyPath: null },
  voters: { keyPath: 'dni' },
  candidates: { keyPath: 'id' },
  blocks: { keyPath: 'index' },
  audit: { keyPath: 'id', autoIncrement: true }
};

let connectionPromise = null;

export function openDB() {
  if (connectionPromise) return connectionPromise;
  connectionPromise = new Promise((resolve, reject) => {
    if (!('indexedDB' in globalThis)) {
      reject(new Error('Este navegador no permite el almacenamiento local (IndexedDB).'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = request.result;
      for (const [name, cfg] of Object.entries(STORES)) {
        if (!db.objectStoreNames.contains(name)) {
          const store = cfg.keyPath
            ? db.createObjectStore(name, { keyPath: cfg.keyPath, autoIncrement: !!cfg.autoIncrement })
            : db.createObjectStore(name);
          if (name === 'voters') store.createIndex('byVoted', 'hasVoted');
          if (name === 'blocks') store.createIndex('byType', 'type');
        }
      }
      event.target.transaction.oncomplete = () => resolve(db);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('No se pudo abrir la base de datos.'));
    request.onblocked = () => reject(new Error('La base de datos está bloqueada por otra pestaña.'));
  });
  return connectionPromise;
}

async function store(name, mode = 'readonly') {
  const db = await openDB();
  return db.transaction(name, mode).objectStore(name);
}

export function get(name, key) {
  return new Promise(async (resolve, reject) => {
    try {
      const s = await store(name);
      const req = s.get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    } catch (err) { reject(err); }
  });
}

export function getAll(name) {
  return new Promise(async (resolve, reject) => {
    try {
      const s = await store(name);
      const req = s.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    } catch (err) { reject(err); }
  });
}

export function put(name, value, key) {
  return new Promise(async (resolve, reject) => {
    try {
      const s = await store(name, 'readwrite');
      const req = key === undefined ? s.put(value) : s.put(value, key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    } catch (err) { reject(err); }
  });
}

export function del(name, key) {
  return new Promise(async (resolve, reject) => {
    try {
      const s = await store(name, 'readwrite');
      const req = s.delete(key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    } catch (err) { reject(err); }
  });
}

export function clear(name) {
  return new Promise(async (resolve, reject) => {
    try {
      const s = await store(name, 'readwrite');
      const req = s.clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    } catch (err) { reject(err); }
  });
}

export function count(name) {
  return new Promise(async (resolve, reject) => {
    try {
      const s = await store(name);
      const req = s.count();
      req.onsuccess = () => resolve(req.result || 0);
      req.onerror = () => reject(req.error);
    } catch (err) { reject(err); }
  });
}

/**
 * Operación atómica de bajo nivel. `fn` debe usar la API nativa de
 * IndexedDB (sin await) para que la transacción no se cierre antes.
 */
export async function atomic(storeNames, mode, fn) {
  const db = await openDB();
  const names = Array.isArray(storeNames) ? storeNames : [storeNames];
  return new Promise((resolve, reject) => {
    const tx = db.transaction(names, mode);
    const stores = {};
    for (const name of names) stores[name] = tx.objectStore(name);
    let result;
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error || new Error('Error de transacción'));
    tx.onabort = () => reject(tx.error || new Error('Transacción cancelada'));
    try {
      result = fn(stores, tx);
    } catch (err) {
      try { tx.abort(); } catch { /* noop */ }
      reject(err);
    }
  });
}

export async function clearAll() {
  await Promise.all(Object.keys(STORES).map((name) => clear(name)));
}
