// src/components/Promo.js
import { state, isFav, toggleFav } from '../core/state.js';
import { priceFmt } from '../core/utils.js';
import {
  promoIsActive, promoTheme, productInPromo,
  effectivePrice, discountInfo, promoBadgesFor,
  // ↓ добавили в promo.js
  promoTitle, promoSubtitle
} from '../core/promo.js';

export function renderPromo(router) {
  if (!promoIsActive()) { location.hash = '#/'; return; }

  const theme = promoTheme();
  const list = (state.products || []).filter(productInPromo);

  const v = document.getElementById('view');
  v.innerHTML = `
    <style>
      .promo-wrap{
        position: relative;
        padding: 12px;
        background: ${theme.gridBg || '#0b1220'};
        ${theme.gridBgImage ? `background-image: url('${theme.gridBgImage}'); background-size: 480px; background-repeat: repeat;` : ''}
        ${theme.gridTint ? `box-shadow: inset 0 0 0 9999px ${theme.gridTint};` : ''}
        border-radius: 0;
      }

      /* ❄️ Снежок — чистым CSS, без JS */
      .promo-snow{
        pointer-events:none;
        position:absolute; inset:0; overflow:hidden;
      }
      .promo-snow::before, .promo-snow::after{
        content:"";
        position:absolute; inset:-20%;
        background-image:
          radial-gradient(2px 2px at 20% 20%, rgba(255,255,255,.9) 99%, transparent),
          radial-gradient(2px 2px at 80% 30%, rgba(255,255,255,.8) 99%, transparent),
          radial-gradient(2px 2px at 40% 70%, rgba(255,255,255,.85) 99%, transparent),
          radial-gradient(3px 3px at 60% 50%, rgba(255,255,255,.8) 99%, transparent),
          radial-gradient(1.5px 1.5px at 10% 60%, rgba(255,255,255,.9) 99%, transparent),
          radial-gradient(2px 2px at 90% 80%, rgba(255,255,255,.8) 99%, transparent);
        background-size: 200px 200px, 260px 260px, 220px 220px, 280px 280px, 240px 240px, 300px 300px;
        animation: snow-fall 18s linear infinite;
        opacity: .35;
      }
      .promo-snow::after{
        animation-duration: 26s;
        opacity: .22;
        filter: blur(1px);
      }
      @keyframes snow-fall{
        0%   { transform: translateY(-8%); }
        100% { transform: translateY(8%); }
      }

      .promo-head{
        position:relative; z-index:1;
        display:flex; align-items:baseline; gap:10px; margin: 6px 0 12px; color:#fff;
      }
      .promo-head .t1{
        font-weight:900; font-size:clamp(20px,5.8vw,26px); letter-spacing:.4px;
      }
      .promo-head .t2{
        opacity:.85; font-weight:800; font-size:clamp(12px,3.6vw,14px);
        padding:6px 10px; border-radius:999px;
        background: rgba(255,255,255,.12); border:1px solid rgba(255,255,255,.22);
        backdrop-filter: blur(4px) saturate(1.2);
      }

      /* Небольшая «гирлянда» */
      .promo-garland{
        position:relative; z-index:1;
        display:flex; gap:6px; padding:6px 0 10px; margin-top:-2px;
      }
      .promo-dot{
        width:10px; height:10px; border-radius:50%;
        box-shadow: 0 0 12px currentColor, 0 0 24px currentColor;
        opacity:.95;
      }
      .promo-dot.red{    color:#ff6b6b; background:currentColor; }
      .promo-dot.green{  color:#22c55e; background:currentColor; }
      .promo-dot.blue{   color:#60a5fa; background:currentColor; }
      .promo-dot.gold{   color:#f59e0b; background:currentColor; }

      .promo-grid{
        position:relative; z-index:1;
        display:grid; grid-template-columns:1fr 1fr; gap:12px;
      }
      @media (max-width: 380px){ .promo-grid{ grid-template-columns:1fr; } }

      .promo-card{
        position:relative; display:block; background:#fff; border-radius:var(--radius,22px);
        overflow:hidden; border:1px solid var(--stroke,#ececec);
        box-shadow:0 10px 34px rgba(0,0,0,.12);
        text-decoration:none; color:inherit;
      }
      .promo-card .img{ width:100%; aspect-ratio:1/1; object-fit:cover; display:block; }
      .promo-card .body{ padding:10px; }
      .promo-card .title{ font-weight:800; font-size:14px; line-height:1.2; color:#121111; }
      .promo-card .sub{ color:var(--muted,#787676); font-size:12px; margin-top:4px; }
      .promo-card .price{ display:flex; align-items:center; gap:8px; margin-top:8px; font-weight:900; }
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
        border-radius:999px; background:rgba(255,255,255,.86);
        border:1px solid rgba(0,0,0,.06);
      }
      @media (prefers-color-scheme:dark){
        .fav{ background:rgba(17,24,39,.86); border-color:rgba(255,255,255,.18); }
      }
      .fav.active .lucide-heart{ color:#ff4d5a; fill:currentColor; stroke:none }

    </style>

    <div class="promo-wrap home-bottom-pad">
      <div class="promo-snow"></div>

      <div class="promo-head">
        <div class="t1">${escapeHtml(promoTitle())}</div>
        <div class="t2">${escapeHtml(promoSubtitle())}</div>
      </div>

      <div class="promo-garland" aria-hidden="true">
        <span class="promo-dot red"></span>
        <span class="promo-dot green"></span>
        <span class="promo-dot blue"></span>
        <span class="promo-dot gold"></span>
        <span class="promo-dot red"></span>
        <span class="promo-dot green"></span>
      </div>

      <div class="promo-grid" id="promoGrid"></div>
    </div>
  `;

  const grid = document.getElementById('promoGrid');
  grid.innerHTML = list.map(p => renderPromoCard(p)).join('');

  // иконки для бейджей/сердечек
  window.lucide?.createIcons && lucide.createIcons();

  // Делегирование кликов
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
          <span>${escapeHtml(b.label)}</span>
        </span>`).join('')}
      <button class="fav ${isFav(p.id)?'active':''}" data-id="${p.id}" aria-pressed="${isFav(p.id)?'true':'false'}" type="button" title="В избранное">
        <i data-lucide="heart"></i>
      </button>
      <img class="img" src="${p.images?.[0]||''}" alt="${escapeHtml(p.title)}" loading="lazy">
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

/* ====== локальные утилиты ====== */
function escapeHtml(s=''){
  return String(s).replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}
function categoryNameBySlug(slug){
  for (const g of (state.categories||[])){
    if (g.slug === slug) return g.name;
    for (const ch of (g.children||[])){ if (ch.slug === slug) return ch.name; }
  }
  return '';
}
