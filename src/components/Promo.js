// src/components/Promo.js
import { state, isFav, toggleFav } from '../core/state.js';
import { priceFmt } from '../core/utils.js';
import {
  promoIsActive, promoTheme, productInPromo,
  effectivePrice, discountInfo, promoBadgesFor,
  promoTitle, promoSubtitle,
  applyPromoTheme, clearPromoTheme,
  ensureTestPromoSeed,
} from '../core/promo.js';

/**
 * ВАЖНО:
 * - Используем ОБЫЧНУЮ сетку .grid и карточки .card → размеры 1:1 с главной.
 * - Меняем только: hero, фон, бейджи и цены (зачёркнутая/со скидкой).
 * - При уходе со страницы — чистим тему.
 */

export function renderPromo(router) {
  if (!promoIsActive()) {
    try { clearPromoTheme(); } catch {}
    location.hash = '#/';
    return;
  }

  try { ensureTestPromoSeed(); } catch {}
  applyPromoTheme(true);

  const products  = Array.isArray(state.products) ? state.products : [];
  const promoList = products.filter(productInPromo);
  const fallback  = products.length ? products.slice(0, 24) : [];
  const list      = promoList.length ? promoList : fallback;

  const v = document.getElementById('view'); if (!v) return;

  // твой верхний баннер (берём первый)
  const banners = getPromoBanners();
  const topBanner = banners?.[0];

  v.innerHTML = `
    <div class="promo-wrap" style="padding:0 0 calc(var(--tabbar-h) + var(--safe) + 10px)">
      ${topBanner ? `
        <a class="promo-banner promo-top" href="#/promo" aria-label="Промо">
          <img src="${topBanner.img}" alt="${escapeHtml(topBanner.alt||'Акция')}" loading="eager" decoding="async">
        </a>
      ` : ''}
      <div class="grid" id="promoGrid"></div>
    </div>
  `;

  const grid = document.getElementById('promoGrid');

  // (можешь оставить твои скелетоны, если нужно)
  grid.innerHTML = list.map(p => renderStandardCard(p)).join('');
  window.lucide?.createIcons && lucide.createIcons();

  // автосброс темы при уходе со страницы
  const cleanup = () => {
    if (!location.hash.startsWith('#/promo')) {
      try { clearPromoTheme(); } catch {}
      window.removeEventListener('hashchange', cleanup);
    }
  };
  window.addEventListener('hashchange', cleanup);
}

/* ===== helpers ===== */

function renderStandardCard(p){
  const di = discountInfo(p);
  const price = effectivePrice(p);
  const badges = promoBadgesFor(p);
  const img0 = p.images?.[0] || '';

  // пер-картинный скелет + onload → is-ready, чтобы обойти глобальный fade-in
  return `
    <a class="card" data-id="${p.id}" href="#/product/${p.id}">
      <div class="card-img">
        ${badges.length ? `<div class="promo-badges">
          ${badges.map(b => `<span class="promo-badge ${b.type}">${
            b.type==='discount' ? `<i data-lucide="percent"></i>` : `<i data-lucide="zap"></i>`
          }<span>${escapeHtml(b.label)}</span></span>`).join('')}
        </div>` : ``}
        <b class="img-skel" aria-hidden="true"></b>
        <img
          src="${img0}"
          alt="${escapeHtml(p.title)}"
          loading="lazy"
          decoding="async"
          onload="this.classList.add('is-ready'); this.previousElementSibling?.remove()"
        >
      </div>
      <button class="fav ${isFav(p.id)?'active':''}" data-id="${p.id}" aria-pressed="${isFav(p.id)?'true':'false'}" type="button" title="В избранное">
        <i data-lucide="heart"></i>
      </button>
      <div class="card-body">
        <div class="title">${escapeHtml(p.title)}</div>
        <div class="subtitle">${escapeHtml(categoryNameBySlug(p.categoryId) || '')}</div>
        <div class="price-row">
<div class="price">
  ${ di
      ? `<span class="cur deal">${priceFmt(price)}</span>`
      : `<span class="cur">${priceFmt(p.price)}</span>`
    }
</div>

        </div>
      </div>
    </a>
  `;
}


function calcSkeletonCount(){
  const h = (window.visualViewport?.height || window.innerHeight || 700);
  const rows = Math.max(3, Math.min(4, Math.round(h / 260)));
  const cols = (window.innerWidth <= 380) ? 1 : 2;
  return rows * cols;
}

function renderSkeletons(grid, n){
  if (!grid) return;
  const frag = document.createDocumentFragment();
  for (let i=0;i<n;i++){
    const d = document.createElement('a');
    d.className = 'card is-skeleton';
    d.setAttribute('aria-hidden','true');
    d.innerHTML = `
      <div class="card-img"><div class="img-skel"></div></div>
      <div class="card-body">
        <div class="skel skel-title"></div>
        <div class="skel skel-sub"></div>
        <div class="price-row">
          <div class="skel skel-price"></div>
          <div class="skel skel-chip"></div>
        </div>
      </div>`;
    frag.appendChild(d);
  }
  grid.appendChild(frag);
}

function categoryNameBySlug(slug){
  for (const g of (state.categories||[])){
    if (g.slug === slug) return g.name;
    for (const ch of (g.children||[])){ if (ch.slug === slug) return ch.name; }
  }
  return '';
}
function escapeHtml(s=''){ return String(s).replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
