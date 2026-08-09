// Phase 5: live JS soft-reload helper.
// Loading the same module twice in a row from the browser cache returns the
// cached version. We dodge the cache by appending a unique query string.
// Returns the freshly-evaluated module namespace.
//
// Public surface (via window.UsLiveJs):
//   rel(modulePath)   -> Promise<Module>  - dynamic import with cache-bust

async function rel(modulePath) {
  const url = `${modulePath}?v=${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  return await import(url);
}

window.UsLiveJs = { rel };
