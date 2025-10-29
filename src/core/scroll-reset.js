// src/core/scroll-reset.js
// Сброс скролла «без дёрганья»:
// - короткая серия кадров;
// - отмена ТОЛЬКО при реальном скролле (wheel/touchmove/scroll-keys);
// - работает в окне навигации (hashchange) или с явным allow.

const NAV_WINDOW_MS_DEFAULT = 1400; // было 900 — добавили буфер после рендера
let __allowScrollResetUntil = 0;

// ====== трекинг взаимодействий ======
let __lastScrollInteractAt = 0;   // только «настоящий скролл»
let __lastAnyInteractAt = 0;      // клики/тач-старты и пр. (для справки, но НЕ отменяет)

const _scrollEvents = ['wheel', 'touchmove'];
const _otherEvents  = ['touchstart', 'pointerdown', 'mousedown'];

function _isScrollKey(e){
  const k = e.key;
  return k === 'PageDown' || k === 'PageUp' || k === 'Home' || k === 'End' || k === ' ' || k === 'ArrowDown' || k === 'ArrowUp';
}

_scrollEvents.forEach(t => {
  window.addEventListener(t, () => { __lastScrollInteractAt = Date.now(); }, { passive:true, capture:true });
});

_otherEvents.forEach(t => {
  window.addEventListener(t, () => { __lastAnyInteractAt = Date.now(); }, { passive:true, capture:true });
});

window.addEventListener('keydown', (e) => {
  if (_isScrollKey(e)) __lastScrollInteractAt = Date.now();
  else __lastAnyInteractAt = Date.now();
}, { capture:true });

function _userHasScrolledRecently(ms = 300){
  return (Date.now() - __lastScrollInteractAt) <= ms;
}

// ====== токен отмены ======
let __sessionId = 0;
function _newToken(){
  const id = ++__sessionId;
  return { id, get cancelled(){ return id !== __sessionId; } };
}

// ====== цели ======
function _targets() {
  const list = [];
  const se = document.scrollingElement;
  if (se) list.push(se);
  const view = document.getElementById('view');
  if (view) list.push(view);
  return list;
}

function _toTopOnce(token) {
  if (token?.cancelled) return;
  try { document.activeElement?.blur?.(); } catch {}
  for (const t of _targets()) { try { t.scrollTop = 0; } catch {} }
  try { window.scrollTo(0, 0); } catch {}
}

function _nearTop(){
  const se = document.scrollingElement || document.documentElement;
  return (se?.scrollTop || 0) <= 2;
}

// короткая серия: RAF × 2
function _scheduleShort(token){
  if (token.cancelled) return;
  _toTopOnce(token);
  requestAnimationFrame(()=>{
    if (token.cancelled || _userHasScrolledRecently()) return;
    _toTopOnce(token);
  });
}

function _afterImagesIn(el, token) {
  if (!el) return Promise.resolve();
  const imgs = [...el.querySelectorAll('img')];
  const pending = imgs
    .filter(img => !img.complete || img.naturalWidth === 0)
    .map(img => new Promise(res => {
      const done = () => { img.removeEventListener('load', done); img.removeEventListener('error', done); res(); };
      img.addEventListener('load', done, { once: true });
      img.addEventListener('error', done, { once: true });
    }));
  if (pending.length === 0) return Promise.resolve();

  // ждём не дольше 400 мс; отменяем, если пользователь НАЧАЛ СКРОЛЛ
  return new Promise(resolve => {
    const t = setTimeout(resolve, 400);
    Promise.all(pending).then(()=> { clearTimeout(t); resolve(); });
    const abortCheck = () => {
      if (token.cancelled || _userHasScrolledRecently()) {
        clearTimeout(t); resolve();
      } else {
        requestAnimationFrame(abortCheck);
      }
    };
    requestAnimationFrame(abortCheck);
  });
}

/* ===== окна подавления / тишины ===== */
function _remainMs(untilVar) {
  const until = Number(window[untilVar] || 0);
  return Math.max(0, until - Date.now());
}
let _pendingTimer = null;

function _openNavWindow(ms = NAV_WINDOW_MS_DEFAULT) {
  __allowScrollResetUntil = Date.now() + Math.max(0, ms|0);
}
function _navRemainMs() {
  return Math.max(0, __allowScrollResetUntil - Date.now());
}
function _isResetAllowed(optsAllowFlag) {
  if (optsAllowFlag) return true;
  return _navRemainMs() > 0;
}

export const ScrollReset = {
  request(containerEl, opts = {}) {
    const allow = !!opts.allow;

    if (_remainMs('__dropScrollResetUntil') > 0) return;
    if (!_isResetAllowed(allow)) return;

    // важное изменение: клики/тапы НЕ отменяют; отменяет только реальный скролл
    if (_userHasScrolledRecently()) return;

    const wait = _remainMs('__suppressScrollResetUntil');
    if (wait > 0) {
      if (_pendingTimer) clearTimeout(_pendingTimer);
      _pendingTimer = setTimeout(() => {
        _pendingTimer = null;
        this.request(containerEl, opts);
      }, wait + 12);
      return;
    }

    const token = _newToken();
    queueMicrotask(() => {
      if (token.cancelled) return;
      _scheduleShort(token);

      if (_nearTop()) return;

      _afterImagesIn(containerEl || document.getElementById('view'), token)
        .then(() => {
          if (token.cancelled || _userHasScrolledRecently()) return;
          _scheduleShort(token);
        })
        .catch(()=>{});
    });
  },

  forceNow(opts = {}) {
    const allow = !!opts.allow;
    if (_remainMs('__dropScrollResetUntil') > 0) return;
    if (_remainMs('__suppressScrollResetUntil') > 0) return;
    if (!_isResetAllowed(allow)) return;
    if (_userHasScrolledRecently()) return;
    const token = _newToken();
    _scheduleShort(token);
  },

  suppress(ms = 300) {
    const until = Date.now() + Math.max(0, ms|0);
    window.__suppressScrollResetUntil = until;
    if (_pendingTimer) { clearTimeout(_pendingTimer); _pendingTimer = null; }
  },

  quiet(ms = 600) {
    const until = Date.now() + Math.max(0, ms|0);
    window.__dropScrollResetUntil = until;
    if (_pendingTimer) { clearTimeout(_pendingTimer); _pendingTimer = null; }
  },

  allow(ms = NAV_WINDOW_MS_DEFAULT) {
    _openNavWindow(ms);
  },

  mount() {
    try { if ('scrollRestoration' in history) history.scrollRestoration = 'manual'; } catch {}

    _openNavWindow(NAV_WINDOW_MS_DEFAULT);

    window.addEventListener('hashchange', () => _openNavWindow(NAV_WINDOW_MS_DEFAULT), { capture: true });

    const onPageShow = (e) => {
      if (e && e.persisted) {
        _openNavWindow(NAV_WINDOW_MS_DEFAULT);
        requestAnimationFrame(() => this.request(document.getElementById('view'), { allow: true }));
      }
    };
    window.addEventListener('pageshow', onPageShow);

    requestAnimationFrame(() => this.request(document.getElementById('view'), { allow: true }));
  }
};

// Глобальный канал: принудительный скролл вверх
window.addEventListener('client:scroll:top', () =>
  ScrollReset.request(document.getElementById('view'), { allow: true })
);
