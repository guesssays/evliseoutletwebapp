// src/components/Promo.js
import { state, isFav, toggleFav } from '../core/state.js';
import { priceFmt } from '../core/utils.js';
import {
  promoIsActive,
  getPromoBanners,
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
 * - Рендерим ТОЛЬКО акционные товары (скидка или x2 кэшбек).
 * - Если акционных нет — показываем пустое состояние.
 * - Оформление/фон задаётся через applyPromoTheme() и снимается при уходе.
 */
export function renderPromo(router) {
  if (!promoIsActive()) {
    try { clearPromoTheme(); } catch {}
    location.hash = '#/';
    return;
  }

  // гарантируем тестовые данные при оффлайне
  try { ensureTestPromoSeed(); } catch {}

  // тема промо (фон/токены)
  applyPromoTheme(true);

  const v = document.getElementById('view');
  if (!v) return;
  v.classList.add('promo-page');

  const products = Array.isArray(state.products) ? state.products : [];
  const promoList = products.filter(productInPromo);

  const banners = getPromoBanners();
  const topBanner = banners?.[0];

  // Пустое состояние
  if (promoList.length === 0) {
    v.innerHTML = `
      <div class="promo-wrap" style="padding:20px 18px calc(var(--tabbar-h) + var(--safe) + 10px)">
        ${topBanner ? `
          <a class="promo-banner promo-top" href="#/promo" aria-label="Промо">
            <img src="${topBanner.img}" alt="${escapeHtml(topBanner.alt || 'Акция')}" loading="eager" decoding="async">
          </a>` : ``}
        <div class="section-title" style="margin:10px 0 8px; display:flex; align-items:center; gap:10px">
          <span style="font-weight:800">${escapeHtml(promoTitle())}</span>
        </div>
        <div class="notes-empty">
          <b style="display:block;font-weight:800;margin-bottom:6px">Скоро акции</b>
          <div>Подготовим скидки и x2 кэшбек — загляните позже</div>
        </div>
      </div>
    `;



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

<div class="section promo-head" style="padding:10px 0 0; text-align:left; display:block">
   <div class="page-title" style="margin:0 0 6px; display:flex; align-items:center; justify-content:flex-start; padding-left:0">
     <button class="square-btn neutral promo-back" type="button" aria-label="Назад" title="Назад" style="width:44px; height:44px; margin-right:10px">
            <i data-lucide="chevron-left"></i>
          </button>
          <h1 class="p-title" style="margin:0; font-size:28px; font-weight:800">
            ${escapeHtml(promoTitle())}
          </h1>
        </div>
         <div class="p-desc" style="margin-top:2px; color:var(--muted); text-align:left">${escapeHtml(promoSubtitle())}</div>
      </div>

      <!-- сетка промо-товаров -->
<div id="promoGrid" class="grid home-bottom-pad" style="padding:10px 0 0"></div>

    </div>
  `;



  try { window.lucide?.createIcons?.(); } catch {}

  // Назад
  const backBtn = v.querySelector('.promo-back');
  backBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    history.back();
  });

  // Сетка карточек
  const grid = document.getElementById('promoGrid');
  if (grid) {
    grid.innerHTML = promoList.map(renderCard).join('');
    try { window.lucide?.createIcons?.(); } catch {}

    // Перехват «сердечек» без перехода в карточку
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

/* ===== helpers ===== */




function bindCleanup() {
  const cleanup = () => {
    if (!location.hash.startsWith('#/promo')) {
      try { clearPromoTheme(); } catch {}
      const v = document.getElementById('view');
      v?.classList?.remove?.('promo-page');



      window.removeEventListener('hashchange', cleanup);
    }
  };
  window.addEventListener('hashchange', cleanup);
}

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
                <span>${escapeHtml(b.label)}</span>
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
