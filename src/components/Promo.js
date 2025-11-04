// src/components/Promo.js
import { state, isFav, toggleFav } from '../core/state.js';
import { priceFmt } from '../core/utils.js';
import {
  promoIsActive,

  productInPromo,
  effectivePrice,
  discountInfo,
  promoBadgesFor,
  promoTitle,
  promoSubtitle,
  applyPromoTheme,
  clearPromoTheme,
  ensureTestPromoSeed,
} from '../core/promo.js';

/**
 * Страница «Акции»
 */
export function renderPromo(router) {
  if (!promoIsActive()) {
    try { clearPromoTheme(); } catch {}
    location.hash = '#/';
    return;
  }

  try { ensureTestPromoSeed(); } catch {}
  applyPromoTheme(true);

  const v = document.getElementById('view');
  if (!v) return;
  v.classList.add('promo-page');

  const products = Array.isArray(state.products) ? state.products : [];
  const promoList = products.filter(productInPromo);

  // ✅ Свой герой-баннер для страницы «Акции», независим от главной
  const topBanner = {
    img: 'assets/promo/newyear/hero-banner.jpg',     // путь к вашему отдельному файлу
    alt: 'Предновогодние акции EVLISE'
  };

  // === локальные стили (только для промо-страницы) ===
  const HEAD_PAD_X = 0; // ещё меньше слева
  // отступы внешнего контейнера шапки от баннера и от сетки
  const WRAP_MARGIN_TOP = 18;
  const WRAP_MARGIN_BOTTOM = 16;

  // строка с кнопкой и заголовком
  const headRowStyles = `
    display:flex; align-items:center; gap:10px;
    padding:0 ${HEAD_PAD_X}px;
  `;
  // белая квадратная кнопка «назад»
  const backBtnStyles = `
    width:40px; height:40px;
    display:grid; place-items:center;
    background:var(--paper);
    border:1px solid var(--stroke);
    border-radius:12px;
    box-shadow:0 1px 2px rgba(0,0,0,.04);
  `;
  const titleStyles = `margin:0; font-size:28px; font-weight:800;`;
  // подзаголовок: маленький зазор с заголовком и без лишних боковых отступов
  const subStyles = `
    margin:2px 0 0; 
    padding:0 ${HEAD_PAD_X}px; 
    color:var(--muted);
  `;

  // Пустое состояние
  if (promoList.length === 0) {
    v.innerHTML = `
      <div class="promo-wrap" style="padding:20px 0 calc(var(--tabbar-h) + var(--safe) + 10px)">
        ${topBanner ? `
          <a class="promo-banner promo-top" href="#/promo" aria-label="Промо">
            <img src="${topBanner.img}" alt="${escapeHtml(topBanner.alt || 'Акция')}" loading="eager" decoding="async">
          </a>` : ``}

        <!-- внешний контейнер шапки: отступы от баннера/сетки -->
        <div class="promo-headwrap2" style="margin:${WRAP_MARGIN_TOP}px 0 ${WRAP_MARGIN_BOTTOM}px;">
          <div class="promo-head2" style="${headRowStyles}">
            <button class="promo-back2" type="button" aria-label="Назад" title="Назад" style="${backBtnStyles}">
              <i data-lucide="chevron-left"></i>
            </button>
            <h1 class="promo-title2" style="${titleStyles}">${escapeHtml(promoTitle())}</h1>
          </div>
          <div class="promo-sub2" style="${subStyles}">
            ${escapeHtml(promoSubtitle())}
          </div>
        </div>

        <div class="notes-empty" style="margin:0 ${HEAD_PAD_X}px;">
          <b style="display:block;font-weight:800;margin-bottom:6px">Скоро акции</b>
          <div>Подготовим скидки и x2 кэшбек — загляните позже</div>
        </div>
      </div>
    `;

    try { wirePromoHead(v); } catch {}
    bindCleanup();
    try { window.lucide?.createIcons?.(); } catch {}
    return;
  }

  // Основной рендер
  v.innerHTML = `
    <div class="promo-wrap" style="padding:0 0 calc(var(--tabbar-h) + var(--safe) + 10px)">
      ${topBanner ? `
        <a class="promo-banner promo-top" href="#/promo" aria-label="Промо">
          <img src="${topBanner.img}" alt="${escapeHtml(topBanner.alt || 'Акция')}" loading="eager" decoding="async">
        </a>
      ` : ``}

      <!-- внешний контейнер шапки: аккуратные поля от баннера и от сетки -->
      <div class="promo-headwrap2" style="margin:${WRAP_MARGIN_TOP}px 0 ${WRAP_MARGIN_BOTTOM}px;">
        <div class="promo-head2" style="${headRowStyles}">
          <button class="promo-back2" type="button" aria-label="Назад" title="Назад" style="${backBtnStyles}">
            <i data-lucide="chevron-left"></i>
          </button>
          <h1 class="promo-title2" style="${titleStyles}">${escapeHtml(promoTitle())}</h1>
        </div>
        <div class="promo-sub2" style="${subStyles}">
          ${escapeHtml(promoSubtitle())}
        </div>
      </div>

      <!-- сетка промо-товаров -->
      <div id="promoGrid" class="grid home-bottom-pad" style="padding:0"></div>
    </div>
  `;

  try { window.lucide?.createIcons?.(); } catch {}
  try { wirePromoHead(v); } catch {}

  // Сетка карточек
  const grid = document.getElementById('promoGrid');
  if (grid) {
    grid.innerHTML = promoList.map(renderCard).join('');
    try { window.lucide?.createIcons?.(); } catch {}

    if (!grid.dataset.favHandlerBound) {
      grid.addEventListener('click', (ev) => {
        const favBtn = ev.target?.closest?.('.fav, button.fav');
        if (!favBtn) return;
        ev.preventDefault();

        const card = favBtn.closest('.card, a.card');
        const href = card?.getAttribute('href') || '';
        let pid = card?.dataset?.id || '';
        if (!pid && href.startsWith('#/product/')) pid = href.replace('#/product/', '').trim();
        if (!pid) return;

        const now = toggleFav(pid);
        favBtn.classList.toggle('active', now);
        favBtn.setAttribute('aria-pressed', String(now));

        try {
          window.dispatchEvent(new CustomEvent('fav:changed', { detail: { id: pid, active: now } }));
          window.dispatchEvent(new CustomEvent('favorites:updated'));
        } catch {}
      }, { passive: false, capture: true });

      grid.dataset.favHandlerBound = '1';
    }
  }

  bindCleanup();
}

function wirePromoHead(root){
  const backBtn = root.querySelector('.promo-back2');
  backBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    try {
      state.filters = state.filters || {};
      state.filters.category = 'all';          // ✅ сразу сбрасываем
      window.__forceHomeAllOnce = Date.now();  // ✅ даём Home понять, что это «возврат»
    } catch {}

    // Если есть история — идём назад, иначе явно на главную
    if (history.length > 1) {
      history.back();
    } else {
      location.hash = '#/';
    }
  });
}


/* ===== render helpers ===== */
function renderCard(p) {
  const di = discountInfo(p);
  const price = effectivePrice(p);
  const badges = promoBadgesFor(p);
  const img0 = p.images?.[0] || '';

  return `
    <a class="card" data-id="${escapeAttr(p.id)}" href="#/product/${escapeAttr(p.id)}">
      <div class="card-img">
        ${badges.length ? `
          <div class="promo-badges">
${badges.map(b => `
  <span class="promo-badge ${b.type}">
    ${b.type === 'discount' ? `<i data-lucide="percent"></i>` : `<i data-lucide="zap"></i>`}
    <span class="lbl">${escapeHtml(b.label)}</span>
  </span>
`).join('')}

          </div>
        ` : ``}
        <b class="img-skel" aria-hidden="true"></b>
        <img
          src="${escapeAttr(img0)}"
          alt="${escapeAttr(p.title || '')}"
          loading="lazy"
          decoding="async"
          onload="this.classList.add('is-ready'); this.previousElementSibling?.remove()"
        >
      </div>

      <button class="fav ${isFav(p.id) ? 'active' : ''}" data-id="${escapeAttr(p.id)}"
        aria-pressed="${isFav(p.id) ? 'true' : 'false'}" type="button" title="В избранное">
        <i data-lucide="heart"></i>
      </button>

      <div class="card-body">
        <div class="title">${escapeHtml(p.title || '')}</div>
        <div class="subtitle">${escapeHtml(categoryNameBySlug(p.categoryId) || '')}</div>
        <div class="price-row">
          <div class="price">
            ${di
              ? `<span class="cur deal">${priceFmt(price)}</span>`
              : `<span class="cur">${priceFmt(p.price)}</span>`
            }
          </div>
        </div>
      </div>
    </a>
  `;
}

function categoryNameBySlug(slug) {
  for (const g of (state.categories || [])) {
    if (g.slug === slug) return g.name;
    for (const ch of (g.children || [])) { if (ch.slug === slug) return ch.name; }
  }
  return '';
}

function escapeHtml(s = '') {
  return String(s).replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[m]));
}

function escapeAttr(s = '') {
  return String(s).replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function bindCleanup() {
  const cleanup = () => {
    if (!location.hash.startsWith('#/promo')) {
      try {
        state.filters = state.filters || {};
        state.filters.category = 'all';          // ✅ гарантированно
        window.__forceHomeAllOnce = Date.now();  // ✅ флажок для Home
      } catch {}

      try { clearPromoTheme(); } catch {}
      const v = document.getElementById('view');
      v?.classList?.remove?.('promo-page');
      window.removeEventListener('hashchange', cleanup);
    }
  };
  window.addEventListener('hashchange', cleanup);
}
