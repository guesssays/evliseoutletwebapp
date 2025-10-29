// src/core/scroll-reset.js
// Сброс скролла «без дёрганья» с максимальной совместимостью:
// - таргетим window + documentElement + body + scrollingElement + #view;
// - отменяем только при реальном скролле (wheel/touchmove/scroll-keys);
// - работает в окне навигации И/ИЛИ при allow:true;
// - forceNow() по умолчанию имеет allow:true;
// - 🔇 тапы по «избранному» мгновенно отменяют любые активные циклы ресета.

const NAV_WINDOW_MS_DEFAULT = 1800;
let __allowScrollResetUntil = 0;

// ===== трекинг реального скролла =====
let __lastScrollInteractAt = 0;

function _isScrollKey(e){
  const k = e.key;
  return (
    k === 'PageDown' || k === 'PageUp' || k === 'Home' || k === 'End' || k === ' ' ||
    k === 'ArrowDown' || k === 'ArrowUp'
  );
}

['wheel','touchmove'].forEach(t => {
  window.addEventListener(t, () => { __lastScrollInteractAt = Date.now(); }, { passive:true, capture:true });
});
window.addEventListener('keydown', (e) => {
  if (_isScrollKey(e)) __lastScrollInteractAt = Date.now();
}, { capture:true });

function _userHasScrolledRecently(ms = 300){
  return (Date.now() - __lastScrollInteractAt) <= ms;
}

// ===== сессия / токен отмены =====
let __sessionId = 0;
function _newToken(){
  const id = ++__sessionId;
  return { id, get cancelled(){ return id !== __sessionId; } };
}

// ===== цели для сброса =====
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

function _nearTop(){
  const se = document.scrollingElement || document.documentElement || document.body;
  return (se && typeof se.scrollTop === 'number') ? (se.scrollTop <= 2) : true;
}

// Короткий мягкий цикл + лёгкий «дожим» таймерами
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
      img.addEventListener('load', done, { once: true });
      img.addEventListener('error', done, { once: true });
    }));
  if (pending.length === 0) return Promise.resolve();

  return new Promise(resolve => {
    const t = setTimeout(resolve, 450);
    Promise.all(pending).then(()=> { clearTimeout(t); resolve(); });
    const abortCheck = () => {
      if (token.cancelled || _userHasScrolledRecently()) { clearTimeout(t); resolve(); }
      else { requestAnimationFrame(abortCheck); }
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

// ⚠️ Критично: «тихий режим» теперь ещё и инвалидирует активные сессии,
// чтобы мгновенно остановить уже запущенные циклы и убрать мигание.
function _quiet(ms = 600){
  __sessionId++; // ← инвалидировать все текущие токены немедленно
  const until = Date.now() + Math.max(0, ms|0);
  window.__dropScrollResetUntil = until;
  if (_pendingTimer) { clearTimeout(_pendingTimer); _pendingTimer = null; }
}

export const ScrollReset = {
  request(containerEl, opts = {}) {
    const allow = !!opts.allow;
    if (_remainMs('__dropScrollResetUntil') > 0) return;
    if (!_isResetAllowed(allow)) return;
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
        .then(() => { if (!token.cancelled && !_userHasScrolledRecently()) _scheduleShort(token); })
        .catch(()=>{});
    });
  },

  forceNow(opts = {}) {
    const allow = (opts.allow === false) ? false : true; // default allow:true
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

  quiet(ms = 600) { _quiet(ms); },

  allow(ms = NAV_WINDOW_MS_DEFAULT) { _openNavWindow(ms); },

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

// === 🔇 Автоглушилка для избранного ===============================
// При любых «сердцах» мгновенно глушим и ОТМЕНЯЕМ активные циклы,
// плюс ставим короткий suppress, чтобы новые попытки не стартовали следом.

const FAV_SELECTORS = [
  '#btnFixFav',                 // сердечко в фикс-хедере товара
  '.card .fav',                 // сердечко в карточке на сетке
  '[aria-label="В избранное"]'  // общий случай
].join(',');

function _muteForFav(){
  _quiet(900);                  // мгновенно отменить всё активное + drop новые запросы
  window.__suppressScrollResetUntil = Date.now() + 900; // и не пытаться перезапускать
}

['pointerdown','click'].forEach(type => {
  document.addEventListener(type, (e) => {
    const btn = e.target && (e.target.closest ? e.target.closest(FAV_SELECTORS) : null);
    if (btn) _muteForFav();
  }, { capture: true, passive: true });
});

// Глобальный канал: принудительный скролл вверх
window.addEventListener('client:scroll:top', () =>
  ScrollReset.forceNow({ allow:true })
);
