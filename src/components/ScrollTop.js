// src/components/ScrollTop.js
// Кнопка "Наверх": сам создаёт узел при отсутствии, вешает поведение, управляет hidden.

let cleanup = null;

function ensureNode() {
  let btn = document.getElementById('scrollTopBtn');
  if (!btn) {
    btn = document.createElement('button');
    btn.id = 'scrollTopBtn';
    btn.className = 'icon-btn';
    btn.setAttribute('aria-label', 'Наверх');
    btn.setAttribute('hidden', '');
    btn.innerHTML = `<i data-lucide="chevrons-up"></i>`;
    document.body.appendChild(btn);
  }
  return btn;
}

function bindBehavior(btn) {
  const THRESHOLD = 320; // пикселей прокрутки до показа

  const onScroll = () => {
    const y = Math.max(document.documentElement.scrollTop || 0, window.scrollY || 0);
    const shouldShow = y > THRESHOLD;
    if (shouldShow) {
      btn.hidden = false;
      btn.setAttribute('aria-hidden', 'false');
    } else {
      btn.hidden = true;
      btn.setAttribute('aria-hidden', 'true');
    }
  };

  const onClick = () => {
    try {
      const el = document.scrollingElement || document.documentElement || document.body;
      el.scrollTo({ top: 0, behavior: 'smooth' });
    } catch {
      window.scrollTo(0, 0);
    }
  };

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('hashchange', () => setTimeout(onScroll, 0));
  btn.addEventListener('click', onClick);

  // первичный расчёт
  onScroll();

  return () => {
    window.removeEventListener('scroll', onScroll);
    btn.removeEventListener('click', onClick);
  };
}

export function mountScrollTop() {
  try {
    const btn = ensureNode();
    cleanup?.();
    cleanup = bindBehavior(btn);
    // перерисуем иконку на случай динамической вставки
    try { window.lucide?.createIcons?.(); } catch {}
  } catch (e) {
    console.warn('[ScrollTop] init failed', e);
  }
}

export function destroyScrollTop() {
  try { cleanup?.(); cleanup = null; } catch {}
}

export default { mountScrollTop, destroyScrollTop };
