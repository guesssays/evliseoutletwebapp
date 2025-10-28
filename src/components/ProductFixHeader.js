// src/components/ProductFixHeader.js
// Самостоятельный модуль фикс-хедера карточки товара.
// Управляет показом/скрытием в зависимости от скролла и текущего роута (#/product/...).

function tpl() {
  return `
    <button id="btnFixBack" class="fixbtn" aria-label="Назад">
      <i data-lucide="arrow-left"></i>
    </button>
    <button id="btnFixFav" class="fixbtn" aria-label="В избранное" aria-pressed="false">
      <i data-lucide="heart"></i>
    </button>
  `;
}

function ensureNode() {
  let wrap = document.getElementById('productFixHdr');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.id = 'productFixHdr';
    wrap.className = 'product-fixhdr';
    wrap.setAttribute('aria-hidden', 'true');
    wrap.innerHTML = tpl();
    document.body.appendChild(wrap);
  } else if (!wrap.querySelector('#btnFixBack') || !wrap.querySelector('#btnFixFav')) {
    wrap.innerHTML = tpl();
  }
  return wrap;
}

function isProductRoute() {
  const h = String(location.hash || '');
  return h.startsWith('#/product/') || h.startsWith('#/p/');
}

let current = {
  active: false,
  onBack: null,
  onFavToggle: null,
  isFav: () => false,
  showThreshold: 20,// px — когда показать хедер при скролле
};

function syncVisibility() {
  const wrap = document.getElementById('productFixHdr');
  const stat = document.querySelector('.app-header');
  if (!wrap) return;

  const y = Math.max(window.scrollY || 0, document.documentElement.scrollTop || 0);
  const shouldShow = current.active && isProductRoute() && y > current.showThreshold;

  wrap.classList.toggle('show', shouldShow);
  wrap.setAttribute('aria-hidden', shouldShow ? 'false' : 'true');

  // Прячем/показываем статичный хедер для чистой анимации
  if (stat) stat.classList.toggle('hidden', !!shouldShow);
}

function bindHandlers() {
  const wrap = ensureNode();
  const back = wrap.querySelector('#btnFixBack');
  const fav  = wrap.querySelector('#btnFixFav');

  back.onclick = (e) => {
    e.preventDefault();
    if (typeof current.onBack === 'function') current.onBack();
    else history.back();
  };

  fav.onclick = (e) => {
    e.preventDefault();
    if (typeof current.onFavToggle === 'function') current.onFavToggle();
    // Сразу визуально обновим
    setFavActive(current.isFav?.() || false);
  };

  // Первичная отрисовка статуса избранного
  setFavActive(current.isFav?.() || false);

  // Lucide
  try { window.lucide?.createIcons?.(); } catch {}
}

function onScroll() { syncVisibility(); }
function onHash()   { syncVisibility(); }

export function activateProductFixHeader(opts = {}) {
  current = {
    ...current,
    active: true,
    onBack: opts.onBack || current.onBack,
    onFavToggle: opts.onFavToggle || current.onFavToggle,
    isFav: typeof opts.isFav === 'function' ? opts.isFav : current.isFav,
    showThreshold: Number(opts.showThreshold ?? current.showThreshold),
  };

  ensureNode();
  bindHandlers();

  // Подписки (сначала снимаем на всякий, затем вешаем заново)
  try {
    window.removeEventListener('scroll', onScroll);
    window.removeEventListener('hashchange', onHash);
  } catch {}

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('hashchange', onHash);

  // Синк сразу
  syncVisibility();
}

export function deactivateProductFixHeader() {
  current.active = false;
  syncVisibility();
  // ✅ Снимаем слушатели, чтобы не копились при навигации
  try {
    window.removeEventListener('scroll', onScroll);
    window.removeEventListener('hashchange', onHash);
  } catch {}
}

export function setFavActive(on) {
  try {
    const fav = document.getElementById('btnFixFav');
    if (fav) {
      fav.classList.toggle('active', !!on);
      fav.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
  } catch {}
}

export default {
  activateProductFixHeader,
  deactivateProductFixHeader,
  setFavActive,
};
