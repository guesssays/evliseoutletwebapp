// src/components/ScrollTop.js
// Кнопка «Наверх»: корректная доступность и синхронизация hidden/aria-hidden/inert
export function mountScrollTop(threshold = 400) {
  const btn = document.getElementById('scrollTopBtn');
  if (!btn) return;

  const hide = () => {
    try { if (document.activeElement === btn) document.activeElement.blur(); } catch {}
    btn.setAttribute('hidden', '');
    btn.setAttribute('aria-hidden', 'true');
    btn.setAttribute('inert', '');
  };

  const show = () => {
    btn.removeAttribute('hidden');
    // важно: aria-hidden полностью убираем (не "false")
    btn.removeAttribute('aria-hidden');
    btn.removeAttribute('inert');
  };

  const update = () => {
    const y = window.scrollY || document.documentElement.scrollTop || 0;
    if (y > threshold) show(); else hide();
  };

  btn.addEventListener('click', () => {
    try { document.activeElement?.blur?.(); } catch {}
    window.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
  });

  window.addEventListener('scroll', update, { passive: true });
  window.addEventListener('resize', update);
  window.addEventListener('hashchange', () => setTimeout(update, 0));

  // Инициализация ARIA-сост. (пусть изначально скрыта)
  hide();
  setTimeout(update, 0);
}
