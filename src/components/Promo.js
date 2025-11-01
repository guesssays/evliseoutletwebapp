// src/components/Promo.js
import { state, isFav, toggleFav } from '../core/state.js';
import { priceFmt } from '../core/utils.js';
import {
  promoIsActive, promoTheme, productInPromo,
  effectivePrice, discountInfo, promoBadgesFor
} from '../core/promo.js';

export function renderPromo(router) {
  if (!promoIsActive()) { location.hash = '#/'; return; }

  const theme = promoTheme();
  const list = (state.products || []).filter(productInPromo);

  const v = document.getElementById('view');
  v.innerHTML = `
    <style>
      .promo-wrap{
        padding: 12px;
        background: ${theme.gridBg || '#0b1220'};
        ${theme.gridBgImage ? `background-image: url('${theme.gridBgImage}'); background-size: 480px; background-repeat: repeat;` : ''}
      }
      .promo-head{
        display:flex; align-items:baseline; gap:10px; margin: 6px 0 10px;
        color: #fff;
      }
      .promo-head .t1{ font-weight:900; font-size:clamp(18px,5.2vw,22px) }
      .promo-head .t2{ opacity:.75; font-weight:800 }
      .promo-grid{
        display:grid; grid-template-columns:1fr 1fr; gap:12px;
      }
      .promo-card{
        position:relative; display:block; background:#fff; border-radius:var(--radius,22px);
        overflow:hidden; border:1px solid var(--stroke,#ececec);
      }
      .promo-card .img{ width:100%; aspect-ratio:1/1; object-fit:cover; display:block; }
      .promo-card .body{ padding:10px; }
      .promo-card .title{ font-weight:800; font-size:14px; line-height:1.2; color:#121111; }
      .promo-card .sub{ color:var(--muted,#787676); font-size:12px; margin-top:4px; }
      .promo-card .price{
        display:flex; align-items:center; gap:8px; margin-top:8px; font-weight:900;
      }
      .promo-card .old{ text-decoration: line-through; color:#a1a1aa; font-weight:700; }
      .promo-card .new{ color:#121111; }

      .promo-badge{
        position:absolute; left:8px; top:8px; z-index:2;
        display:inline-flex; align-items:center; gap:6px;
        padding:6px 10px; border-radius:999px; font-size:12px; font-weight:900; line-height:1;
        color:#fff;
        box-shadow:0 6px 18px rgba(0,0,0,.20); border:1px solid rgba(255,255,255,.22);
      }
      .promo-badge.discount{ background:${theme.badgeColor || '#ef4444'}; }
      .promo-badge.x2{ background:${theme.badgeX2Color || '#06b6d4'}; }

      .fav{
        position:absolute; right:8px; top:8px; z-index:2;
        width:36px; height:36px; display:inline-flex; align-items:center; justify-content:center;
        border-radius:999px; background:rgba(255,255,255,.82);
        border:1px solid rgba(0,0,0,.06);
      }
      @media (prefers-color-scheme:dark){
        .fav{ background:rgba(17,24,39,.82); border-color:rgba(255,255,255,.18); }
      }
    </style>

    <div class="promo-wrap home-bottom-pad">
      <div class="promo-head">
        <div class="t1">Новогодняя акция</div>
        <div class="t2">скидки и x2 кэшбек</div>
      </div>

      <div class="promo-grid" id="promoGrid"></div>
    </div>
  `;

  const grid = document.getElementById('promoGrid');
  grid.innerHTML = list.map(p => renderPromoCard(p)).join('');

  window.lucide?.createIcons && lucide.createIcons();

  grid.addEventListener('click', (e) => {
    const favBtn = e.target.closest('.fav');
    if (favBtn) {
      e.preventDefault();
      const pid = favBtn.getAttribute('data-id');
      const now = toggleFav(pid);
      favBtn.classList.toggle('active', now);
      favBtn.setAttribute('aria-pressed', String(now));
      try { window.dispatchEvent(new CustomEvent('fav:changed', { detail: { id: pid, active: now } })); } catch {}
      try { window.dispatchEvent(new CustomEvent('favorites:updated')); } catch {}
      return;
    }
    const card = e.target.closest('a.promo-card');
    if (card) { location.hash = `#/product/${card.getAttribute('data-id')}`; }
  });
}

function renderPromoCard(p){
  const di = discountInfo(p);
  const price = effectivePrice(p);
  const badges = promoBadgesFor(p);

  return `
    <a class="promo-card" data-id="${p.id}" href="#/product/${p.id}">
      ${badges.map(b => `<span class="promo-badge ${b.type}">
          ${b.type==='discount' ? `<i data-lucide="percent"></i>` : `<i data-lucide="zap"></i>`}
          <span>${b.label}</span>
        </span>`).join('')}
      <button class="fav ${isFav(p.id)?'active':''}" data-id="${p.id}" aria-pressed="${isFav(p.id)?'true':'false'}" type="button">
        <i data-lucide="heart"></i>
      </button>
      <img class="img" src="${p.images?.[0]||''}" alt="${escapeHtml(p.title)}">
      <div class="body">
        <div class="title">${escapeHtml(p.title)}</div>
        <div class="sub">${escapeHtml(categoryNameBySlug(p.categoryId) || '')}</div>
        <div class="price">
          ${di ? `<span class="old">${priceFmt(di.oldPrice)}</span>` : ``}
          <span class="new">${priceFmt(price)}</span>
        </div>
      </div>
    </a>
  `;
}

/* ====== утилиты локальные ====== */
function escapeHtml(s=''){ return String(s).replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
function categoryNameBySlug(slug){
  for (const g of (state.categories||[])){
    if (g.slug === slug) return g.name;
    for (const ch of (g.children||[])){ if (ch.slug === slug) return ch.name; }
  }
  return '';
}
