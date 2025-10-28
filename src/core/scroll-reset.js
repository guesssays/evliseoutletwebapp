// src/core/scroll-reset.js
// Жёсткий, многокадровый сброс скролла + учёт загрузки изображений и bfcache.
// Добавлено: подавление ScrollReset на короткое окно (suppress), чтобы клики fixed-header не дёргали вверх.

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

/* ===== Подавление ScrollReset на короткое окно ===== */
function _remainMs() {
  const until = Number(window.__suppressScrollResetUntil || 0);
  return Math.max(0, until - Date.now());
}

export const ScrollReset = {
  /**
   * Просим сброс скролла на следующий цикл перерисовки.
   * Если включено подавление — переносим вызов на конец окна подавления.
   */
  request(containerEl) {
    const wait = _remainMs();
    if (wait > 0) {
      setTimeout(() => this.request(containerEl), wait + 10);
      return;
    }
    queueMicrotask(() => {
      _scheduleFrames();
      _afterImagesIn(containerEl || document.getElementById('view'))
        .then(() => _scheduleFrames())
        .catch(() => {});
    });
  },

  /** Немедленно сбросить вверх (игнорируя подавление не вызываем). */
  forceNow() {
    const wait = _remainMs();
    if (wait > 0) return; // уважаем подавление
    _scheduleFrames();
  },

  /**
   * Включить подавление ScrollReset на ms миллисекунд.
   * Используем при кликах «Назад»/сердце во fixed-header.
   */
  suppress(ms = 400) {
    const until = Date.now() + Math.max(0, ms|0);
    window.__suppressScrollResetUntil = until;
  },

  /**
   * Инициализация: manual scrollRestoration + фикса bfcache.
   */
  mount() {
    try {
      if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    } catch {}

    const onPageShow = (e) => {
      if (e && e.persisted) {
        requestAnimationFrame(() => this.request(document.getElementById('view')));
      }
    };
    window.addEventListener('pageshow', onPageShow);

    requestAnimationFrame(() => this.request(document.getElementById('view')));
  }
};

// Глобальный канал: window.dispatchEvent(new Event('client:scroll:top'))
window.addEventListener('client:scroll:top', () => ScrollReset.request(document.getElementById('view')));
