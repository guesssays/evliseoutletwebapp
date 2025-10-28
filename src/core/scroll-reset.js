// src/core/scroll-reset.js
// Жёсткий, многокадровый сброс скролла + подавление и «тихое окно»,
// ТЕПЕРЬ: работает ТОЛЬКО возле навигации (hashchange) или по явному allow.

function _targets() {
  const list = [];
  if (document.scrollingElement) list.push(document.scrollingElement);
  const view = document.getElementById('view'); if (view) list.push(view);
  list.push(document.documentElement, document.body, window);
  return list.filter(Boolean);
}

function _toTopOnce() {
  try { document.activeElement?.blur?.(); } catch {}
  for (const t of _targets()) {
    try {
      if (t === window) window.scrollTo(0, 0);
      else t.scrollTop = 0;
    } catch {}
  }
}

function _scheduleFrames() {
  _toTopOnce();
  requestAnimationFrame(() => {
    _toTopOnce();
    requestAnimationFrame(() => {
      _toTopOnce();
      setTimeout(_toTopOnce, 0);
      setTimeout(_toTopOnce, 80);
      setTimeout(_toTopOnce, 160);
      setTimeout(_toTopOnce, 240);
    });
  });
}

function _afterImagesIn(el) {
  if (!el) return Promise.resolve();
  const imgs = [...el.querySelectorAll('img')];
  const pending = imgs
    .filter(img => !img.complete || img.naturalWidth === 0)
    .map(img => new Promise(res => {
      const done = () => { 
        img.removeEventListener('load', done); 
        img.removeEventListener('error', done); 
        res(); 
      };
      img.addEventListener('load', done, { once: true });
      img.addEventListener('error', done, { once: true });
    }));
  // Увеличиваем тайм-аут до 600 мс для более гибкой обработки
  return Promise.race([
    Promise.all(pending),
    new Promise(res => setTimeout(res, 600))
  ]);
}

/* ===== Окна подавления / тишины ===== */
function _remainMs(untilVar) {
  const until = Number(window[untilVar] || 0);
  return Math.max(0, until - Date.now());
}
let _pendingTimer = null;

/* ===== Окно НАВИГАЦИИ: разрешаем сброс только рядом с hashchange/start ===== */
const NAV_WINDOW_MS_DEFAULT = 2000;  // Увеличиваем окно навигации до 2000 мс
let __allowScrollResetUntil = 0;

function _openNavWindow(ms = NAV_WINDOW_MS_DEFAULT) {
  __allowScrollResetUntil = Date.now() + Math.max(0, ms|0);
}
function _navRemainMs() {
  return Math.max(0, __allowScrollResetUntil - Date.now());
}
function _isResetAllowed(optsAllowFlag) {
  // 1) явное разрешение (e.g., для клиентских событий)
  if (optsAllowFlag) return true;
  // 2) только в окне навигации (после hashchange/start)
  return _navRemainMs() > 0;
}

export const ScrollReset = {
  /**
   * Просим сброс скролла.
   * Работает только:
   *  - в течение «окна навигации» после hashchange/start
   *  - или если передан opts.allow === true
   * Плюс учитывает suppress/quiet.
   */
  request(containerEl, opts = {}) {
    const allow = !!opts.allow;

    // «тихое окно»: полностью игнорируем без переназначений
    if (_remainMs('__dropScrollResetUntil') > 0) return;

    // не в окне навигации и без явного allow — выходим (не дёргаем страницу)
    if (!_isResetAllowed(allow)) return;

    // отложим на конец suppress-окна
    const wait = _remainMs('__suppressScrollResetUntil');
    if (wait > 0) {
      if (_pendingTimer) clearTimeout(_pendingTimer);
      _pendingTimer = setTimeout(() => {
        _pendingTimer = null;
        this.request(containerEl, opts);
      }, wait + 12);
      return;
    }

    // обычная работа
    queueMicrotask(() => {
      _scheduleFrames();
      _afterImagesIn(containerEl || document.getElementById('view'))
        .then(() => _scheduleFrames())
        .catch(() => {});
    });
  },

  /**
   * Мгновенный сброс — те же правила (нужно окно навигации или opts.allow).
   */
  forceNow(opts = {}) {
    const allow = !!opts.allow;
    if (_remainMs('__dropScrollResetUntil') > 0) return;
    if (_remainMs('__suppressScrollResetUntil') > 0) return;
    if (!_isResetAllowed(allow)) return;
    _scheduleFrames();
  },

  /** Перенести ближайшие сбросы на ms миллисекунд (для back/внутренней навигации). */
  suppress(ms = 400) {
    const until = Date.now() + Math.max(0, ms|0);
    window.__suppressScrollResetUntil = until;
    if (_pendingTimer) { clearTimeout(_pendingTimer); _pendingTimer = null; }
  },

  /**
   * Полностью «заглушить» любые запросы на ms миллисекунд (без переотложений).
   * Используем для интра-кликов (например, сердечко), чтобы не сработали чужие request().
   */
  quiet(ms = 600) {
    const until = Date.now() + Math.max(0, ms|0);
    window.__dropScrollResetUntil = until;
    if (_pendingTimer) { clearTimeout(_pendingTimer); _pendingTimer = null; }
  },

  /**
   * Опционально: можно явным вызовом открыть окно навигации, если где-то
   * выполняется переход без hashchange (редко, но пусть будет).
   */
  allow(ms = NAV_WINDOW_MS_DEFAULT) {
    _openNavWindow(ms);
  },

  // (только один апдейт внутри mount())
  mount() {
    try { if ('scrollRestoration' in history) history.scrollRestoration = 'manual'; } catch {}

    // При старте дать небольшое окно для первичного сброса
    _openNavWindow(NAV_WINDOW_MS_DEFAULT);

    // Любая смена хеша — открыть окно навигации (и скролл можно сбрасывать)
    window.addEventListener('hashchange', () => _openNavWindow(NAV_WINDOW_MS_DEFAULT), { capture: true });

    const onPageShow = (e) => {
      // Возвращение из bfcache — тоже считаем как «навигацию»
      if (e && e.persisted) {
        _openNavWindow(NAV_WINDOW_MS_DEFAULT);
        requestAnimationFrame(() => this.request(document.getElementById('view'), { allow: true }));
      }
    };
    window.addEventListener('pageshow', onPageShow);

    // Первичный запрос — разрешаем явно
    requestAnimationFrame(() => this.request(document.getElementById('view'), { allow: true }));
  }
};

// Глобальный канал: разрешаем явно (кнопка «Наверх» или принудительный скролл вверх)
window.addEventListener('client:scroll:top', () =>
  ScrollReset.request(document.getElementById('view'), { allow: true })
);
