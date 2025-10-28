// src/core/scroll-reset.js
// Универсальный менеджер "подними экран наверх после рендера"
export const ScrollReset = (() => {
  let pending = false;

  function toTop() {
    try { document.activeElement?.blur?.(); } catch {}
    const view = document.getElementById('view');
    // Стреляем и в контейнер, и в окно — перекрываем любые кейсы WebView
    if (view && view.scrollHeight > view.clientHeight) {
      try { view.scrollTo({ top: 0, behavior: 'auto' }); } catch {}
      try { view.scrollTop = 0; } catch {}
    }
    try { window.scrollTo({ top: 0, behavior: 'auto' }); } catch {}
    // двойной выстрел против "упругости"
    try {
      const se = document.scrollingElement || document.documentElement;
      se.scrollTop = 0;
    } catch {}
  }

  function flush() {
    if (!pending) return;
    pending = false;
    // 3 такта: сразу, rAF и таймер — чтобы попасть после всех layout/образов
    toTop();
    requestAnimationFrame(() => {
      toTop();
      setTimeout(toTop, 0);
    });
  }

  function request() {
    if (pending) return;
    pending = true;
    // выполняем сразу после текущего рендера/микротасков
    queueMicrotask(flush);
  }

  function now() { pending = false; flush(); }

  // Нужен, чтобы вызов в main.js не падал. Пока — no-op.
  function mount() {
    // Можно оставить пустым. Если понадобится — тут можно вешать глобальные слушатели.
  }

  return { request, now, flush, mount };
})();
