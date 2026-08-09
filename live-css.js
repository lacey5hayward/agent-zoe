// Phase 5: live CSS hot-reload.
// The host page includes an empty <style id="us-live-css"> tag immediately
// after the linked stylesheet. We fill it with the latest copy of
// styles.css so edits apply instantly without a reload.
//
// Public surface (via window.UsLiveCss):
//   apply(css)        -> fills the live tag
//   clear()           -> empties it (revert to shipped styles.css)
//   current()         -> string, the value last applied

function tag() {
  return document.getElementById('us-live-css');
}

function apply(css) {
  const el = tag();
  if (!el) return;
  el.textContent = css == null ? '' : String(css);
}

function clear() {
  apply('');
}

function current() {
  const el = tag();
  return el ? el.textContent : '';
}

window.UsLiveCss = { apply, clear, current };
