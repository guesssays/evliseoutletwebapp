// src/core/scroll-reset.js
// Жёсткий, многокадровый сброс скролла + учёт загрузки изображений.

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
  // Несколько кадров подряд: сразу, rAF, rAF+rAF, и с таймерами —
  // это надёжно перебивает отложенные перерисовки/ресторы браузера
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
  // мягкий лимит ожидания, чтобы не зависнуть навсегда
  return Promise.race([
    Promise.all(pending),
    new Promise(res => setTimeout(res, 350))
  ]);
}

export const ScrollReset = {
  /**
   * Просим сброс скролла на следующий цикл перерисовки.
   * Опционально можно передать контейнер (обычно #view) — чтобы дождаться изображений.
   */
  request(containerEl) {
    queueMicrotask(() => {
      _scheduleFrames();
      // ещё серия попыток после загрузки изображений в контейнере
      _afterImagesIn(containerEl || document.getElementById('view'))
        .then(() => _scheduleFrames())
        .catch(() => {});
    });
  },

  /** Немедленно сбросить вверх и сделать несколько попыток. */
  forceNow() {
    _scheduleFrames();
  }
};

// Глобальный канал: кто угодно может вызвать window.dispatchEvent(new Event('client:scroll:top'))
window.addEventListener('client:scroll:top', () => ScrollReset.request(document.getElementById('view')));
