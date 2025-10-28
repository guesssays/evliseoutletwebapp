// src/components/ScrollTop.js
// Самостоятельный модуль для кнопки "Наверх".
// Работает поверх разметки #scrollTopBtn, а при её отсутствии — создаёт узел сам.

function ensureNode() {
  let btn = document.getElementById('scrollTopBtn');
  if (!btn) {
    btn = document.createElement('button');
    btn.id = 'scrollTopBtn';
    btn.className = 'icon-btn';
    btn.setAttribute('aria-label', 'Наверх');
    btn.setAttribute('hidden', '');
    btn.innerHTML = `<i data-lucide="arrow-up"></i>`;
    document.body.appendChild(btn);
  }
  return btn;
}

function bindBehavior(btn) {
  const threshold = 300; // px
  const onScroll = () => {
    const y = Math.max(window.scrollY || 0, document.documentElement.scrollTop || 0);
    if (y > threshold) {
      btn.removeAttribute('hidden');
    } else {
      btn.setAttribute('hidden', '');
    }
  };

  const onClick = () => {
    try {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch {
      window.scrollTo(0, 0);
    }
  };

  window.addEventListener('scroll', onScroll, { passive: true });
  btn.addEventListener('click', onClick);

  // Инициализация
  onScroll();

  return () => {
    window.removeEventListener('scroll', onScroll);
    btn.removeEventListener('click', onClick);
  };
}

let cleanup = null;

export function mountScrollTop() {
  try {
    const btn = ensureNode();
    cleanup?.();
    cleanup = bindBehavior(btn);
    // Иконки Lucide
    try { window.lucide?.createIcons?.(); } catch {}
  } catch (e) {
    console.warn('[ScrollTop] init failed', e);
  }
}

export function destroyScrollTop() {
  try { cleanup?.(); cleanup = null; } catch {}
}

export default { mountScrollTop, destroyScrollTop };
