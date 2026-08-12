// Phase 5: IndexedDB-backed project file store.
// Every project file lives here once the page boots. On first run, the
// loader fetches the shipped versions from the network and seeds the IDB.
// Subsequent loads read from IDB so the build agent can edit freely.
//
// Conventions:
//   key   = same as the on-disk path, e.g. "styles.css", "app.js",
//           "functions/api/proxy/index.js"
//   value = the file's text content
//
// Public surface (via window.UsFiles):
//   list()                              -> string[]
//   read(path)                          -> string  (empty string if absent)
//   write(path, content)                -> void    (writes; applies nothing)
//   resetAll()                          -> void    (clears the store)
//   snapshotPaths                       -> string[] (the canonical file list)

const DB_NAME = 'us-files-db';
const DB_VERSION = 1;
const STORE = 'files';

// Canonical file list — these are the files we know about. Anything else
// stored in IDB is ignored.
const SHIPPED_PATHS = [
  'index.html',
  'style.css',
  'app.js',
  'README.md',
  'MERGE.md',
  'functions/api/proxy/index.js',
  'functions/api/proxy/status.js'
];

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function txDone(db, mode) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
    return tx;
  });
}

async function list() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAllKeys();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function read(path) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(path);
    req.onsuccess = () => resolve(req.result == null ? '' : req.result);
    req.onerror = () => reject(req.error);
  });
}

async function write(path, content) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    (tx.objectStore(STORE).put(String(content !== null && tx.objectStore(STORE).put(String(content !== undefined ? tx.objectStore(STORE).put(String(content : ''),) path);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function remove(path) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(path);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function resetAll() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// First-run seeding: if any shipped path is missing in IDB, fetch it from the
// network and store. Best-effort: if a fetch fails (e.g. file:// origin), we
// skip silently and the user can open the editor for that file from scratch.
async function seedFromNetwork(paths = SHIPPED_PATHS) {
  const have = new Set(await list());
  const missing = paths.filter(p => !have.has(p));
  if (missing.length === 0) return [];
  const fetched = [];
  for (const path of missing) {
    try {
      const res = await fetch(path, { cache: 'no-cache' });
      if (!res.ok) continue;
      const text = await res.text();
      await write(path, text);
      fetched.push(path);
    } catch (_) {
      // network unavailable or CORS — skip; user can edit-blank later
    }
  }
  return fetched;
}

window.UsFiles = {
  list,
  read,
  write,
  remove,
  resetAll,
  seedFromNetwork,
  SHIPPED_PATHS
};
