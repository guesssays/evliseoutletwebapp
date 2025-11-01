// src/components/Promo.js
import { state, isFav, toggleFav } from '../core/state.js';
import { priceFmt } from '../core/utils.js';
import {
  promoIsActive, promoTheme, productInPromo,
  effectivePrice, discountInfo, promoBadgesFor,
  promoTitle, promoSubtitle
} from '../core/promo.js';

export function renderPromo(router) {
  if (!promoIsActive()) { location.hash = '#/'; return; }

  const theme = promoTheme();
  const products = Array.isArray(state.products) ? state.products : [];

  const promoList = products.filter(productInPromo);
  const fallback  = (products.length ? products.slice(0, 24) : []);
  const list = promoList.length ? promoList : fallback;
  const isFallback = promoList.length === 0;

  const v = document.getElementById('view'); if (!v) return;

  // ← включаем фон для контейнера
  v.classList.add('promo-page');

  v.innerHTML = `
    <style>
      .promo-wrap{ padding: 10px 10px calc(var(--tabbar-h) + var(--safe) + 10px); }
      .promo-hero{
        position:relative;
        margin: 0 0 12px;
        padding: 16px 14px;
        border-radius: var(--radius,22px);
        color:#fff;
        background: ${theme.gridBg || 'transparent'};
        ${theme.gridBgImage ? `background-image:url('${theme.gridBgImage}'); background-size: 420px; background-repeat: repeat;` : ''}
        ${theme.gridTint ? `box-shadow: inset 0 0 0 9999px ${theme.gridTint};` : ''}
        border:1px solid rgba(255,255,255,.10);
        backdrop-filter: blur(2px) saturate(1.1);
      }
      .promo-hero .t1{ font-weight:900; font-size:clamp(20px,6vw,26px); letter-spacing:.2px; }
      .promo-hero .t2{
        display:inline-block; margin-top:8px;
        opacity:.96; font-weight:800; font-size:12px;
        padding:6px 10px; border-radius:999px;
        background: rgba(255,255,255,.12); border:1px solid rgba(255,255,255,.22);
        backdrop-filter: blur(4px) saturate(1.2);
      }
      .promo-garland{ display:flex; gap:6px; margin-top:10px }
      .promo-dot{ width:8px; height:8px; border-radius:50%; box-shadow:0 0 10px currentColor, 0 0 18px currentColor }
      .promo-dot.red{color:#ff6b6b;background:currentColor}
      .promo-dot.green{color:#22c55e;background:currentColor}
      .promo-dot.blue{color:#60a5fa;background:currentColor}
      .promo-dot.gold{color:#f59e0b;background:currentColor}

      .promo-grid{ display:grid; grid-template-columns:1fr 1fr; gap:12px; }
      @media (max-width:380px){ .promo-grid{ grid-template-columns:1fr } }

      .promo-card{
        position:relative; display:block; background:#fff; border-radius:var(--radius,22px);
        overflow:hidden; border:1px solid var(--stroke,#ececec);
        box-shadow:0 10px 34px rgba(0,0,0,.10); color:inherit; text-decoration:none;
      }
      .promo-card .img{ width:100%; aspect-ratio:1/1; object-fit:cover; display:block; }
      .promo-card .body{ padding:10px }
      .promo-card .title{ font-weight:800; font-size:14px; line-height:1.2; color:#121111 }
      .promo-card .sub{ color:var(--muted,#787676); font-size:12px; margin-top:4px }
      .promo-card .price{ display:flex; align-items:center; gap:8px; margin-top:8px; font-weight:900 }
      .promo-card .old{ text-decoration:line-through; color:#a1a1aa; font-weight:700 }
      .promo-card .new{ color:#121111 }

      .promo-badge{
        position:absolute; left:8px; top:8px; z-index:2;
        display:inline-flex; align-items:center; gap:6px;
        padding:5px 8px; border-radius:999px; font-size:11px; font-weight:900; line-height:1;
        color:#fff; border:1px solid rgba(255,255,255,.20);
        box-shadow:0 6px 18px rgba(0,0,0,.20);
      }
      .promo-badge i,[data-lucide]{ width:14px; height:14px }
      .promo-badge.discount{ background:${theme.badgeColor || '#ef4444'} }
      .promo-badge.x2{ background:${theme.badgeX2Color || '#06b6d4'} }

      .fav{
        position:absolute; right:8px; top:8px; z-index:2;
        width:36px; height:36px; display:inline-flex; align-items:center; justify-content:center;
        border-radius:999px; background:rgba(255,255,255,.86);
        border:1px solid rgba(0,0,0,.06);
      }
      @media (prefers-color-scheme:dark){
        .fav{ background:rgba(17,24,39,.86); border-color:rgba(255,255,255,.18) }
      }
      .fav.active .lucide-heart{ color:#ff4d5a; fill:currentColor; stroke:none }

      .promo-skel{ border:1px solid var(--stroke,#ececec); border-radius:var(--radius,22px); overflow:hidden; background:#fff }
      .promo-skel .img{ aspect-ratio:1/1; background:linear-gradient(90deg,#eee 25%,#f6f6f6 37%,#eee 63%); animation:shm 1.2s infinite }
      .promo-skel .t{ height:14px; margin:10px; border-radius:8px; background:linear-gradient(90deg,#eee 25%,#f6f6f6 37%,#eee 63%); animation:shm 1.2s infinite }
      @keyframes shm{ 0%{background-position:-200px 0} 100%{background-position:200px 0} }

      .promo-note{ padding: 0 2px 10px; color: var(--muted,#787676); font-size:12px }
    </style>

    <div class="promo-wrap">
      <section class="promo-hero">
        <div class="t1">${escapeHtml(promoTitle())}</div>
        <div class="t2">${escapeHtml(promoSubtitle())}</div>
        <div class="promo-garland" aria-hidden="true">
          <span class="promo-dot red"></span>
          <span class="promo-dot green"></span>
          <span class="promo-dot blue"></span>
          <span class="promo-dot gold"></span>
        </div>
      </section>

      ${isFallback ? `<div class="promo-note">Пока подборка акции настраивается — временно показываем несколько товаров.</div>` : ``}

      <div class="promo-grid" id="promoGrid"></div>
    </div>
  `;

  // фон всего #view под акцию
  v.style.setProperty('--promo-page-bg', theme.pageBg || '#0b1220');
  v.style.setProperty('--promo-page-tint', theme.pageTint || 'rgba(255,255,255,.02)');
  if (theme.pageBgImg) {
    v.style.backgroundImage = `url('${theme.pageBgImg}')`;
    v.style.backgroundRepeat = 'repeat';
    v.style.backgroundSize = '420px';
  } else {
    v.style.backgroundImage = 'none';
  }

  const grid = document.getElementById('promoGrid');
  renderSkeletons(grid, calcSkeletonCount());
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
    if (card) location.hash = `#/product/${card.getAttribute('data-id')}`;
  });
}

/* ===== helpers ===== */
function renderPromoCard(p){
  const di = discountInfo(p);
  const price = effectivePrice(p);
  const badges = promoBadgesFor(p); // эксклюзив: либо скидка, либо x2

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
          ${di ? `<span class="old">${priceFmt(di.oldPrice)}</span> <span class="new">${priceFmt(price)}</span>`
               : `<span class="new">${priceFmt(p.price)}</span>`}
        </div>
      </div>
    </a>
  `;
}

function calcSkeletonCount(){
  const h = (window.visualViewport?.height || window.innerHeight || 700);
  const rows = Math.max(2, Math.min(4, Math.round(h / 260)));
  const cols = (window.innerWidth <= 380) ? 1 : 2;
  return rows * cols;
}
function renderSkeletons(grid, n){
  if (!grid) return;
  const frag = document.createDocumentFragment();
  for (let i=0;i<n;i++){
    const d = document.createElement('div');
    d.className = 'promo-skel';
    d.innerHTML = `<div class="img"></div><div class="t" style="width:70%"></div><div class="t" style="width:40%"></div>`;
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
