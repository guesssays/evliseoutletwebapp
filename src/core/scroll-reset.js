// src/core/scroll-reset.js
// Жёсткий, многокадровый сброс скролла + подавление и «тихое окно» для интра-кликов.

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
      const done = () => { img.removeEventListener('load', done); img.removeEventListener('error', done); res(); };
      img.addEventListener('load', done, { once: true });
      img.addEventListener('error', done, { once: true });
    }));
  return Promise.race([
    Promise.all(pending),
    new Promise(res => setTimeout(res, 350))
  ]);
}

/* ===== Окна подавления / тишины ===== */
function _remainMs(untilVar) {
  const until = Number(window[untilVar] || 0);
  return Math.max(0, until - Date.now());
}
let _pendingTimer = null;

export const ScrollReset = {
  /**
   * Просим сброс скролла.
   * Если включено подавление (suppress) — переносим на конец окна.
   * Если включено «тихое окно» (quiet) — просто игнорируем запрос.
   */
  request(containerEl) {
    // если идёт восстановление главной — вообще ничего не делаем


    // «тихое окно»: полностью игнорируем без переназначений
    if (_remainMs('__dropScrollResetUntil') > 0) return;

    const wait = _remainMs('__suppressScrollResetUntil');
    if (wait > 0) {
      if (_pendingTimer) clearTimeout(_pendingTimer);
      _pendingTimer = setTimeout(() => {
        _pendingTimer = null;
        this.request(containerEl);
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


  forceNow() {

    if (_remainMs('__dropScrollResetUntil') > 0) return;
    if (_remainMs('__suppressScrollResetUntil') > 0) return;
    _scheduleFrames();
  },


  /** Перенести любые ближайшие сбросы на ms миллисекунд (для навигации/back). */
  suppress(ms = 400) {
    const until = Date.now() + Math.max(0, ms|0);
    window.__suppressScrollResetUntil = until;
    if (_pendingTimer) { clearTimeout(_pendingTimer); _pendingTimer = null; }
  },

  /**
   * Полностью «заглушить» любые запросы на ms миллисекунд (без переотложений).
   * Используем для интра-кликов (например, сердце), чтобы не сработали чужие request().
   */
  quiet(ms = 600) {
    const until = Date.now() + Math.max(0, ms|0);
    window.__dropScrollResetUntil = until;
    if (_pendingTimer) { clearTimeout(_pendingTimer); _pendingTimer = null; }
  },

// src/core/scroll-reset.js
// (только один апдейт внутри mount())

mount() {
  try { if ('scrollRestoration' in history) history.scrollRestoration = 'manual'; } catch {}

  const onPageShow = (e) => {
    // если планируется восстановление главной — не трогаем

    if (e && e.persisted) {
      requestAnimationFrame(() => this.request(document.getElementById('view')));
    }
  };
  window.addEventListener('pageshow', onPageShow);

requestAnimationFrame(() => this.request(document.getElementById('view')));


}


};

// Глобальный канал
window.addEventListener('client:scroll:top', () => ScrollReset.request(document.getElementById('view')));
