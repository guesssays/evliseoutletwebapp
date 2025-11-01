// src/core/scroll-reset.js
// Сброс скролла «ТОЛЬКО ПРИ НАВИГАЦИИ» + анти-фликер:
// — сброс выполняется максимум ОДИН раз на каждую реальную смену route;
// — локальные клики/перерисовки не способны его вызвать.

const NAV_WINDOW_MS_DEFAULT = 1800;

// ===== навигационные флаги/эпохи =====
let __navEpoch = 0;               // инкремент при реальной смене маршрута
let __lastResetEpoch = -1;        // для анти-фликера: когда последний раз сбрасывали
let __allowScrollResetUntil = 0;  // «окно» разрешения после навигации

function _openNavWindow(ms = NAV_WINDOW_MS_DEFAULT) {
  __allowScrollResetUntil = Date.now() + Math.max(0, ms|0);
}
function _isResetAllowed(explicitAllowFlag) {
  if (explicitAllowFlag) return true;
  return Date.now() <= __allowScrollResetUntil;
}

// ===== тихие окна/жесты пользователя =====
let __quietUntil = 0;
let __suppressUntil = 0;
let __lastUserScrollAt = 0;
let __lastPointerAt = 0;
let __lastRouteChangeAt = 0;

function _now(){ return Date.now(); }
function _remain(ts){ return Math.max(0, ts - _now()); }
function _quiet(ms){ __sessionId++; __quietUntil = _now() + Math.max(0, ms|0); }
function _suppress(ms){ __suppressUntil = _now() + Math.max(0, ms|0); }

['wheel','touchmove'].forEach(t => {
  window.addEventListener(t, () => { __lastUserScrollAt = _now(); }, { passive:true, capture:true });
});
window.addEventListener('keydown', (e) => {
  const k = e.key;
  if (k === 'PageDown' || k === 'PageUp' || k === 'Home' || k === 'End' || k === ' ' ||
      k === 'ArrowDown' || k === 'ArrowUp') __lastUserScrollAt = _now();
}, { capture:true });

['pointerdown','mousedown','touchstart'].forEach(t => {
  window.addEventListener(t, () => {
    __lastPointerAt = _now();
    _quiet(900);
    _suppress(1200);
  }, { capture:true, passive:true });
});

// ===== токены отмены =====
let __sessionId = 0;
function _newToken(){
  const id = ++__sessionId;
  return { id, get cancelled(){ return id !== __sessionId; } };
}

// ===== цели скролла =====
function _targets() {
  const list = new Set();
  try { const se = document.scrollingElement; if (se) list.add(se); } catch {}
  try { const view = document.getElementById('view'); if (view) list.add(view); } catch {}
  try { list.add(document.documentElement); } catch {}
  try { list.add(document.body); } catch {}
  return Array.from(list).filter(Boolean);
}
function _toTopOnce(token) {
  if (token?.cancelled) return;
  try { document.activeElement?.blur?.(); } catch {}
  for (const t of _targets()) { try { t.scrollTop = 0; } catch {} }
  try { window.scrollTo(0, 0); } catch {}
}
function _userHasScrolledRecently(ms = 300){
  return (_now() - __lastUserScrollAt) <= ms;
}
function _nearTop(){
  const se = document.scrollingElement || document.documentElement || document.body;
  return (se && typeof se.scrollTop === 'number') ? (se.scrollTop <= 2) : true;
}
function _scheduleShort(token){
  if (token.cancelled) return;
  _toTopOnce(token);
  requestAnimationFrame(()=>{
    if (token.cancelled || _userHasScrolledRecently()) return;
    _toTopOnce(token);
    setTimeout(()=>{ if (!token.cancelled && !_userHasScrolledRecently()) _toTopOnce(token); }, 60);
    setTimeout(()=>{ if (!token.cancelled && !_userHasScrolledRecently()) _toTopOnce(token); }, 120);
  });
}
function _afterImagesIn(el, token) {
  if (!el) return Promise.resolve();
  const imgs = [...el.querySelectorAll('img')];
  const pending = imgs
    .filter(img => !img.complete || img.naturalWidth === 0)
    .map(img => new Promise(res => {
      const done = () => { img.removeEventListener('load', done); img.removeEventListener('error', done); res(); };
      img.addEventListener('load', done, { once:true });
      img.addEventListener('error', done, { once:true });
    }));
  if (pending.length === 0) return Promise.resolve();
  return new Promise(resolve => {
    const t = setTimeout(resolve, 450);
    Promise.all(pending).then(()=> { clearTimeout(t); resolve(); });
    const tick = () => {
      if (token.cancelled || _userHasScrolledRecently()) { clearTimeout(t); resolve(); }
      else { requestAnimationFrame(tick); }
    };
    requestAnimationFrame(tick);
  });
}

// ===== детектор реальной навигации (hash-router) =====
function _routeKeyFromHash(h){
  if (!h) return null;
  if (h === '#' || h === '#!') return null;
  if (!h.startsWith('#/')) return null;
  const s = h.slice(2);
  const q = s.indexOf('?');
  const core = (q >= 0 ? s.slice(0,q) : s).replace(/^\/+|\/+$/g,'');
  return core; // '' (home), 'cart', 'favorites', 'product/123', ...
}
let __lastRouteKey = _routeKeyFromHash(location.hash);

// одноразовый сброс на новую навигацию
function _onRouteChanged(){
  __navEpoch++;
  __lastRouteChangeAt = _now();
  _openNavWindow(NAV_WINDOW_MS_DEFAULT);
  __quietUntil = 0;
  __suppressUntil = 0;

  // фиксируем, что следующий сброс будет «за эту навигацию»
  const myEpoch = __navEpoch;

  const token = _newToken();
  queueMicrotask(() => {
    if (token.cancelled) return;
    // Если кто-то успел уже «съесть» этот epoch — не повторяем
    if (__lastResetEpoch >= myEpoch) return;
    _scheduleShort(token);
    __lastResetEpoch = myEpoch;      // <<— отметили: сброс применён для текущего route
    if (_nearTop()) return;
    _afterImagesIn(document.getElementById('view'), token)
      .then(()=>{ if (!token.cancelled && !_userHasScrolledRecently()) _scheduleShort(token); })
      .catch(()=>{});
  });
}

window.addEventListener('hashchange', () => {
  const newKey = _routeKeyFromHash(location.hash);
  const oldKey = __lastRouteKey;
  __lastRouteKey = newKey;

  const isRealNav =
    newKey !== oldKey &&
    !(newKey === null && (oldKey === null || oldKey === ''));

  if (!isRealNav) return;

  if ((_now() - __lastPointerAt) <= 450) {
    __quietUntil = 0; __suppressUntil = 0;
  }
  _onRouteChanged();
}, { capture:true });

(function patchHistory(){
  const H = history;
  const wrap = (fn) => function(...args){
    const before = _routeKeyFromHash(location.hash);
    const r = fn.apply(this, args);
    queueMicrotask(() => {
      const after = _routeKeyFromHash(location.hash);
      if (after !== before && !(after === null && (before === null || before === ''))) {
        if ((_now() - __lastPointerAt) <= 450) { __quietUntil = 0; __suppressUntil = 0; }
        _onRouteChanged();
      }
    });
    return r;
  };
  try{ H.pushState = wrap(H.pushState.bind(H)); }catch{}
  try{ H.replaceState = wrap(H.replaceState.bind(H)); }catch{}
})();

// ===== публичное API (c одноразовым барьером) =====
let __pendingTimer = null;

export const ScrollReset = {
  request(containerEl, opts = {}) {
    // анти-фликер: сбрасывать можно ТОЛЬКО если есть «новая навигация», ещё не «съеденная»
    if (__navEpoch <= __lastResetEpoch) return;

    if (_remain(__quietUntil) > 0) return;
    const allow = !!opts.allow;
    if (!_isResetAllowed(allow)) return;
    if (_userHasScrolledRecently()) return;

    const wait = _remain(__suppressUntil);
    if (wait > 0) {
      if (__pendingTimer) clearTimeout(__pendingTimer);
      __pendingTimer = setTimeout(() => {
        __pendingTimer = null;
        this.request(containerEl, opts);
      }, wait + 12);
      return;
    }

    // мы действительно будем сбрасывать — фиксируем epoch заранее
    __lastResetEpoch = __navEpoch;

    const token = _newToken();

    // ⬇️ Глушим сеточный скелетон на короткое окно, чтобы не мигал при программном reset
    try { window.__suppressHomeSkeletonUntil = Date.now() + 1000; } catch {}

    queueMicrotask(() => {
      if (token.cancelled) return;
      _scheduleShort(token);
      if (_nearTop()) return;
      _afterImagesIn(containerEl || document.getElementById('view'), token)
        .then(() => { if (!token.cancelled && !_userHasScrolledRecently()) _scheduleShort(token); })
        .catch(()=>{});
    });
  },

  forceNow(opts = {}) {
    // анти-фликер: вне новой навигации не даём сбросить
    const allow = (opts.allow === true);
    if (__navEpoch <= __lastResetEpoch && !allow) return;

    const ignoreUserScroll = (opts.ignoreUserScroll === true);
    if (_remain(__quietUntil) > 0) return;
    if (_remain(__suppressUntil) > 0 && !allow) return;
    if (!_isResetAllowed(allow)) return;
    if (!ignoreUserScroll && _userHasScrolledRecently()) return;

    __lastResetEpoch = __navEpoch;

    const token = _newToken();

    // ⬇️ Глушим сеточный скелетон на короткое окно, чтобы не мигал при программном reset
    try { window.__suppressHomeSkeletonUntil = Date.now() + 1000; } catch {}

    _scheduleShort(token);
  },

  suppress(ms = 300){ _suppress(ms); if (__pendingTimer){ clearTimeout(__pendingTimer); __pendingTimer=null; } },
  quiet(ms = 600){ _quiet(ms); if (__pendingTimer){ clearTimeout(__pendingTimer); __pendingTimer=null; } },
  allow(ms = NAV_WINDOW_MS_DEFAULT){ _openNavWindow(ms); },

  mount() {
    try { if ('scrollRestoration' in history) history.scrollRestoration = 'manual'; } catch {}

    // стартовая «эпоха» (первый экран) и одноразовый системный сброс
    __lastRouteKey = _routeKeyFromHash(location.hash);
    __navEpoch = 0;
    _openNavWindow(900);

    // системный мягкий сброс на первом входе:
    const token = _newToken();
    queueMicrotask(() => {
      if (token.cancelled) return;
      // считаем старт как «эпоху 0», отметим, что её мы уже «съели» — чтобы клики после старта не мигали
      __lastResetEpoch = __navEpoch;
      this.forceNow({ allow:true, ignoreUserScroll:true });
    });

    window.addEventListener('pageshow', (e) => {
      if (e && e.persisted) {
        _openNavWindow(NAV_WINDOW_MS_DEFAULT);
        // новая «эпоха» для bfcache-возврата
        __navEpoch++;
        __lastResetEpoch = __navEpoch - 1;
        this.forceNow({ allow:true, ignoreUserScroll:true });
        __lastResetEpoch = __navEpoch;
      }
    });
  },

  guardNoResetClick(el, opts = {}) {
    if (!el) return () => {};
    const dur = Number.isFinite(opts.duration) ? Math.max(0, opts.duration|0) : 900;
    const calm = () => { _quiet(dur); _suppress(dur + 200); };
    const onPD = () => calm();
    const onClick = () => calm();
    const onTE = () => calm();
    el.addEventListener('pointerdown', onPD, { passive:true, capture:true });
    el.addEventListener('click', onClick, { passive:true });
    el.addEventListener('touchend', onTE, { passive:true });
    try { el.setAttribute('type','button'); el.setAttribute('role','button'); } catch {}
    return () => {
      try{ el.removeEventListener('pointerdown', onPD, { capture:true }); }catch{}
      try{ el.removeEventListener('click', onClick); }catch{}
      try{ el.removeEventListener('touchend', onTE); }catch{}
    };
  }
};

// Глобальный канал: принудительный скролл вверх (уважает окна и epoch)
window.addEventListener('client:scroll:top', () =>
  ScrollReset.forceNow({ allow:true, ignoreUserScroll:true })
);
