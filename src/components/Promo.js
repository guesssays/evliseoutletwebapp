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

  // пробуем засеять тестовые 6 позиций, если всё пусто
  try { ensureTestPromoSeed(); } catch {}

  // включаем оформление промо
  applyPromoTheme(true);

  const theme = promoTheme();
  const products = Array.isArray(state.products) ? state.products : [];
  const promoList = products.filter(productInPromo);
  const fallback  = (products.length ? products.slice(0, 24) : []);
  const list = promoList.length ? promoList : fallback;
  const isFallback = promoList.length === 0;

  const v = document.getElementById('view'); if (!v) return;

  v.innerHTML = `
    <style>
      /* Только hero и мелкие декоративные вещи. НИКАКИХ размеров карточек! */
      .promo-wrap{
       /* НЕТ боковых отступов: используем те же, что у #view (.view) */
        padding: 0 0 calc(var(--tabbar-h) + var(--safe) + 10px);
     }
      .promo-hero{
        position:relative; margin: 12px 0 12px; padding: 16px 14px;
        border-radius: var(--radius,22px); color:#fff;
        background: ${theme.gridBg || 'transparent'};
        ${theme.gridBgImage ? `background-image:url('${theme.gridBgImage}'); background-size: 420px; background-repeat: repeat;` : ''}
        ${theme.gridTint ? `box-shadow: inset 0 0 0 9999px ${theme.gridTint};` : ''}
        border:1px solid rgba(255,255,255,.10);
        backdrop-filter: blur(2px) saturate(1.1);
      }
      .promo-hero .t1{ font-weight:900; font-size:clamp(20px,6vw,26px); letter-spacing:.2px; }
      .promo-hero .t2{
        display:inline-block; margin-top:8px; opacity:.96; font-weight:800; font-size:12px;
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

      ${isFallback ? `<div class="promo-note" style="color:var(--muted,#787676);font-size:12px;margin:0 2px 10px;">Пока подборка акции настраивается — временно показываем несколько товаров.</div>` : ``}

      <!-- СТАНДАРТНАЯ сетка/карточки (та же .grid, что и на главной) -->
      <div class="grid" id="promoGrid"></div>
    </div>
  `;

  // фон контейнера #view уже проставляется в applyPromoTheme()

  const grid = document.getElementById('promoGrid');
  renderSkeletons(grid, calcSkeletonCount());
  grid.innerHTML = list.map(p => renderStandardCard(p)).join('');
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
    const card = e.target.closest('a.card');
    if (card) location.hash = `#/product/${card.getAttribute('data-id')}`;
  });

  // Автоматическая зачистка темы при смене маршрута
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
            ${
              di
                ? `<span class="cur deal">${priceFmt(price)}</span><span class="price-chip">-${di.percent}%</span>`
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
