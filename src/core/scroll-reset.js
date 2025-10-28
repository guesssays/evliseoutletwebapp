// src/core/scroll-reset.js
// Универсальный менеджер "подними экран наверх после рендера"
export const ScrollReset = (() => {
  let pending = false;

  function toTop() {
    try { document.activeElement?.blur?.(); } catch {}
    const view = document.getElementById('view');
    // Стреляем и в контейнер, и в окно — перекрываем любые кейсы WebView
    if (view && view.scrollHeight > view.clientHeight) {
      view.scrollTo({ top: 0, behavior: 'auto' });
    }
    window.scrollTo({ top: 0, behavior: 'auto' });
    // двойной выстрел против "упругости"
    const se = document.scrollingElement || document.documentElement;
    se.scrollTop = 0;
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

  return { request, now, flush };
})();
