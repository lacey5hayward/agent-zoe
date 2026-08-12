// Phase 5: IndexedDB-backed project file store.
// v2.4.1: Top-level export for iPad/Safari compatibility

const DB_NAME = 'us-files-db';
const DB_VERSION = 2; 
const STORE = 'files';

const SHIPPED_PATHS = [
  'index.html',
  'zoe-style.css',
  'zoe-core.js',
  'README.md',
  'MERGE.md',
  'functions/api/proxy/index.js',
  'functions/api/proxy/status.js',
  'auth.js',
  'build-agent.js',
  'files.js',
  'editor.js',
  'dna-profiles.js',
  'clones.js',
  'clone-state.js',
  'clone-picker.js',
  'personas.js',
  'persona-picker.js',
  'memory.js',
  'memory-ui.js',
  'character-launcher.js',
  'security-key.js'
];

// Define the API first so it's always available
window.UsFiles = {
  SHIPPED_PATHS: SHIPPED_PATHS,
  list: async function() {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).getAllKeys();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  },
  read: async function(path) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(path);
      req.onsuccess = () => resolve(req.result == null ? '' : req.result);
      req.onerror = () => reject(req.error);
    });
  },
  write: async function(path, content) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(String(content || ''), path);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },
  remove: async function(path) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(path);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },
  resetAll: async function() {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },
  seedFromNetwork: async function(paths = SHIPPED_PATHS) {
    const fetched = [];
    for (const path of paths) {
      try {
        const res = await fetch(path + '?v=' + (window.VER || Date.now()), { cache: 'no-cache' });
        if (!res.ok) continue;
        const text = await res.text();
        await this.write(path, text);
        fetched.push(path);
      } catch (_) {}
    }
    return fetched;
  }
};

function openDb() {
  return new Promise((resolve, reject) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    } catch (e) {
      reject(e);
    }
  });
}
