// src/core/scroll-reset.js
// Сброс скролла «без дёрганья»: короткая серия кадров, отмена при взаимодействии,
// действует только рядом с навигацией (hashchange) или с явным allow.

const NAV_WINDOW_MS_DEFAULT = 900; // было 2000 — меньше навязываемся
let __allowScrollResetUntil = 0;

// ====== пользовательское взаимодействие: мгновенная отмена текущих попыток ======
let __lastUserInteractAt = 0;
const _userEvents = [
  'wheel', 'touchstart', 'touchmove', 'pointerdown', 'mousedown',
  'keydown'
];
function _isScrollKey(e){
  const k = e.key;
  return k === 'PageDown' || k === 'PageUp' || k === 'Home' || k === 'End' || k === ' ' || k === 'ArrowDown' || k === 'ArrowUp';
}
_userEvents.forEach(t => {
  window.addEventListener(t, (e) => {
    if (t === 'keydown' && !_isScrollKey(e)) return;
    __lastUserInteractAt = Date.now();
    // активная сессия (если есть) сама увидит токен.cancelled и прекратится
  }, { passive: true, capture: true });
});

function _userHasInteractedRecently(ms = 250){
  return (Date.now() - __lastUserInteractAt) <= ms;
}

// ====== токен отмены (каждый request/forceNow запускает новую сессию) ======
let __sessionId = 0;
function _newToken(){
  const id = ++__sessionId;
  return {
    id,
    get cancelled(){ return id !== __sessionId; }
  };
}

// ====== цели для ресета ======
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
  for (const t of _targets()) {
    try { t.scrollTop = 0; } catch {}
  }
  try { window.scrollTo(0, 0); } catch {}
}

function _nearTop(){
  const se = document.scrollingElement || document.documentElement;
  return (se?.scrollTop || 0) <= 2;
}

// Короткая серия кадр→кадр; прекращаемся при любом признаке взаимодействия
function _scheduleShort(token){
  if (token.cancelled) return;
  _toTopOnce(token);
  requestAnimationFrame(()=>{
    if (token.cancelled || _userHasInteractedRecently() ) return;
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

  // ждём не дольше 400 мс, и отменяем, если юзер начал скроллить
  return new Promise(resolve => {
    const t = setTimeout(resolve, 400);
    Promise.all(pending).then(()=> {
      clearTimeout(t);
      resolve();
    });
    const abortCheck = () => {
      if (token.cancelled || _userHasInteractedRecently()) {
        clearTimeout(t);
        resolve();
      } else {
        requestAnimationFrame(abortCheck);
      }
    };
    requestAnimationFrame(abortCheck);
  });
}

/* ===== окна подавления / тишины (как были) ===== */
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
  /**
   * Запрос сброса скролла.
   * Срабатывает только в окне навигации или при opts.allow === true.
   * Не «насилует» страницу: короткая серия кадров, отмена при взаимодействии.
   */
  request(containerEl, opts = {}) {
    const allow = !!opts.allow;

    if (_remainMs('__dropScrollResetUntil') > 0) return;
    if (!_isResetAllowed(allow)) return;

    // если пользователь уже начал скролл прямо сейчас — не мешаем
    if (_userHasInteractedRecently()) return;

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

      // если мы уже у нуля — не продолжаем «качать» больше
      if (_nearTop()) return;

      _afterImagesIn(containerEl || document.getElementById('view'), token)
        .then(() => {
          if (token.cancelled || _userHasInteractedRecently()) return;
          // последний мягкий дожим после загрузки картинок
          _scheduleShort(token);
        })
        .catch(()=>{ /* ignore */ });
    });
  },

  /**
   * Мгновенный сброс — под теми же правилами (окно навигации или opts.allow).
   * Отменяемся при взаимодействии.
   */
  forceNow(opts = {}) {
    const allow = !!opts.allow;
    if (_remainMs('__dropScrollResetUntil') > 0) return;
    if (_remainMs('__suppressScrollResetUntil') > 0) return;
    if (!_isResetAllowed(allow)) return;
    if (_userHasInteractedRecently()) return;
    const token = _newToken();
    _scheduleShort(token);
  },

  /** Сдвинуть ближайшие сбросы на ms миллисекунд. */
  suppress(ms = 300) {
    const until = Date.now() + Math.max(0, ms|0);
    window.__suppressScrollResetUntil = until;
    if (_pendingTimer) { clearTimeout(_pendingTimer); _pendingTimer = null; }
  },

  /**
   * Полная «тишина» на ms миллисекунд (никаких переотложений).
   */
  quiet(ms = 600) {
    const until = Date.now() + Math.max(0, ms|0);
    window.__dropScrollResetUntil = until;
    if (_pendingTimer) { clearTimeout(_pendingTimer); _pendingTimer = null; }
  },

  /** Открыть окно навигации вручную (если переход нестандартный). */
  allow(ms = NAV_WINDOW_MS_DEFAULT) {
    _openNavWindow(ms);
  },

  // Единоразовая инициализация
  mount() {
    try { if ('scrollRestoration' in history) history.scrollRestoration = 'manual'; } catch {}

    // маленькое окно после первого старта
    _openNavWindow(NAV_WINDOW_MS_DEFAULT);

    // hashchange = открываем окно
    window.addEventListener('hashchange', () => _openNavWindow(NAV_WINDOW_MS_DEFAULT), { capture: true });

    // bfcache возврат — считаем навигацией
    const onPageShow = (e) => {
      if (e && e.persisted) {
        _openNavWindow(NAV_WINDOW_MS_DEFAULT);
        requestAnimationFrame(() => this.request(document.getElementById('view'), { allow: true }));
      }
    };
    window.addEventListener('pageshow', onPageShow);

    // Первичный мягкий запрос (один короткий цикл)
    requestAnimationFrame(() => this.request(document.getElementById('view'), { allow: true }));
  }
};

// Глобальный канал: принудительный скролл вверх (уважаем allow)
window.addEventListener('client:scroll:top', () =>
  ScrollReset.request(document.getElementById('view'), { allow: true })
);
