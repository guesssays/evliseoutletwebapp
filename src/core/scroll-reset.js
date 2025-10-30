// src/core/scroll-reset.js
// Сброс скролла «ТОЛЬКО ПРИ НАВИГАЦИИ» (hash-router).
// — Игнорирует любые клики/кнопки/локальные перерисовки на странице.
// — Срабатывает при реальном изменении route-ключа (части после "#/").
// — Без правок других файлов.

const NAV_WINDOW_MS_DEFAULT = 1800;

// ====== внутренняя «эпоха» навигации и окна разрешения ======
let __navEpoch = 0;                         // увеличивается при реальной навигации
let __allowScrollResetUntil = 0;            // окно, когда разрешён сброс
function _openNavWindow(ms = NAV_WINDOW_MS_DEFAULT) {
  __allowScrollResetUntil = Date.now() + Math.max(0, ms|0);
}
function _isResetAllowed(explicitAllowFlag) {
  if (explicitAllowFlag) return true;
  return Date.now() <= __allowScrollResetUntil;
}

// ====== глобальная «тишина» вокруг пользовательских жестов ======
let __quietUntil = 0;                       // абсолютное «не трогать»
let __suppressUntil = 0;                    // мягкая задержка (перенос request)
let __lastUserScrollAt = 0;                 // реальные жесты прокрутки
let __lastPointerAt = 0;                    // последний pointerdown
let __lastRouteChangeAt = 0;                // последний зафиксированный роут-чейндж

function _now() { return Date.now(); }
function _remain(ts){ return Math.max(0, ts - _now()); }
function _quiet(ms){ __sessionId++; __quietUntil = _now() + Math.max(0, ms|0); }
function _suppress(ms){ __suppressUntil = _now() + Math.max(0, ms|0); }

['wheel','touchmove'].forEach(t => {
  window.addEventListener(t, () => { __lastUserScrollAt = _now(); }, { passive:true, capture:true });
});
window.addEventListener('keydown', (e) => {
  const k = e.key;
  if (k === 'PageDown' || k === 'PageUp' || k === 'Home' || k === 'End' || k === ' ' ||
      k === 'ArrowDown' || k === 'ArrowUp') {
    __lastUserScrollAt = _now();
  }
}, { capture:true });

// Любой «намеренный» пользователем контакт с экраном — включаем тишину.
// Если за ним сразу следует навигация — пробиваем тишину (см. hashchange).
['pointerdown','mousedown','touchstart'].forEach(t => {
  window.addEventListener(t, () => {
    __lastPointerAt = _now();
    _quiet(900);              // жёсткая тишина ~1с
    _suppress(1200);          // мягкая задержка чуть дольше
  }, { capture:true, passive:true });
});

// ====== токен отмены коротких циклов ======
let __sessionId = 0;
function _newToken(){
  const id = ++__sessionId;
  return { id, get cancelled(){ return id !== __sessionId; } };
}

// ====== цели скролла ======
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

// ====== детектор «реальной» навигации для hash-router ======
function _routeKeyFromHash(h){
  // нормализуем: '#/cart?x=1' -> 'cart'; '#/' -> '' (home); '#' или '' -> null (не страница)
  if (!h) return null;
  if (h === '#' || h === '#!' ) return null;
  if (!h.startsWith('#/')) return null;            // любые служебные/telegram-хэши — не считаем страницей
  const s = h.slice(2);
  const q = s.indexOf('?');
  const core = (q >= 0 ? s.slice(0,q) : s).replace(/^\/+|\/+$/g,''); // обрежем слэши
  return core; // '' для home, 'cart', 'favorites', 'product/123', ...
}

let __lastRouteKey = _routeKeyFromHash(location.hash);

// Пробиваем «тишину», если действительно изменилась страница
function _onRouteChanged(){
  __navEpoch++;
  __lastRouteChangeAt = _now();
  _openNavWindow(NAV_WINDOW_MS_DEFAULT);
  // Разрешаем немедленный сброс даже если тишина включена кликом прямо перед переходом
  __quietUntil = 0;
  __suppressUntil = 0;

  const token = _newToken();
  queueMicrotask(() => {
    if (token.cancelled) return;
    _scheduleShort(token);
    if (_nearTop()) return;
    _afterImagesIn(document.getElementById('view'), token)
      .then(()=>{ if (!token.cancelled && !_userHasScrolledRecently()) _scheduleShort(token); })
      .catch(()=>{});
  });
}

// Основной слушатель навигации (hashchange)
window.addEventListener('hashchange', () => {
  const newKey = _routeKeyFromHash(location.hash);
  const oldKey = __lastRouteKey;
  __lastRouteKey = newKey;

  // Не считаем навигацией:
  // 1) Нажатия ведут на '#' (href="#") → null
  // 2) Меняется хэш, но routeKey остаётся тем же (локальные якоря/параметры) → игнор
  const isRealNav =
    newKey !== oldKey &&
    !(newKey === null && (oldKey === null || oldKey === '')); // пустышки не триггерим

  if (!isRealNav) return;

  // Если навигация случилась сразу после pointerdown — снимаем «тишину»
  if ((_now() - __lastPointerAt) <= 450) {
    __quietUntil = 0;
    __suppressUntil = 0;
  }
  _onRouteChanged();
}, { capture:true });

// На случай, если где-то используется history.pushState/replaceState (SPA без hashchange)
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

// ====== Публичное API (совместимо с прежним кодом), но с «умом» ======
let __pendingTimer = null;

export const ScrollReset = {
  /**
   * Мягкий запрос сброса. Теперь он выполнится ТОЛЬКО если:
   *  - мы в окне навигации (открытом по реальной смене route), или
   *  - явно allow:true (ручной вызов), И
   *  - нет активной жёсткой «тишины».
   */
  request(containerEl, opts = {}) {
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

  /**
   * Принудительный немедленный сброс.
   * По умолчанию уважает навигационное окно и «тихие» флаги — чтобы
   * случайные клики не запускали скролл. Для системных сценариев (напр.,
   * pageshow/bfcache/первый рендер) мы вызываем его сами.
   */
  forceNow(opts = {}) {
    const allow = (opts.allow === true);
    const ignoreUserScroll = (opts.ignoreUserScroll === true);
    if (_remain(__quietUntil) > 0) return;
    if (_remain(__suppressUntil) > 0 && !allow) return;
    if (!_isResetAllowed(allow)) return;
    if (!ignoreUserScroll && _userHasScrolledRecently()) return;
    const token = _newToken();
    _scheduleShort(token);
  },

  // Управляющие окна (оставлены для совместимости)
  suppress(ms = 300) { _suppress(ms); if (__pendingTimer){ clearTimeout(__pendingTimer); __pendingTimer=null; } },
  quiet(ms = 600) { _quiet(ms); if (__pendingTimer){ clearTimeout(__pendingTimer); __pendingTimer=null; } },
  allow(ms = NAV_WINDOW_MS_DEFAULT) { _openNavWindow(ms); },

  /**
   * Умный mount:
   *  - отключаем нативное восстановление
   *  - первый вход: мягкий сброс (в окне allow)
   *  - возврат из bfcache: мягкий сброс
   */
  mount() {
    try { if ('scrollRestoration' in history) history.scrollRestoration = 'manual'; } catch {}

    // инициализируем «текущий маршрут» и даём короткое системное окно на старт
    __lastRouteKey = _routeKeyFromHash(location.hash);
    _openNavWindow(900);
    const sysToken = _newToken();
    queueMicrotask(() => {
      if (sysToken.cancelled) return;
      // Системный сброс на первом входе: игнорируем пользовательскую прокрутку
      this.forceNow({ allow:true, ignoreUserScroll:true });
    });

    // bfcache
    window.addEventListener('pageshow', (e) => {
      if (e && e.persisted) {
        _openNavWindow(NAV_WINDOW_MS_DEFAULT);
        this.forceNow({ allow:true, ignoreUserScroll:true });
      }
    });
  },

  /**
   * Старый helper: приглушить ресеты вокруг клика (оставлен для обратной совместимости).
   * Теперь глобальные обработчики уже делают это автоматически, так что вызывать не обязательно.
   */
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

// Глобальный канал: принудительный скролл вверх (уважает окна)
window.addEventListener('client:scroll:top', () =>
  ScrollReset.forceNow({ allow:true, ignoreUserScroll:true })
);
