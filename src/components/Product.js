// src/components/Product.js
import { state, isFav, toggleFav, getUID } from '../core/state.js';
import { priceFmt, colorToHex } from '../core/utils.js';
import { addToCart, removeLineFromCart, isInCart } from './cartActions.js';
import {
  activateProductFixHeader,
  deactivateProductFixHeader,
  setFavActive as setFixFavActive,
} from './ProductFixHeader.js';
import { ScrollReset } from '../core/scroll-reset.js';
import { Loader } from '../ui/loader.js'; // ⬅️ новый лоадер

/* ====== КОНСТАНТЫ КЭШБЕКА/РЕФЕРАЛОВ ====== */
const CASHBACK_RATE_BASE  = 0.05; // 5%
const CASHBACK_RATE_BOOST = 0.10; // 10% для 1-го заказа по реф-ссылке

/* ====== LAZY-LOAD SETUP ====== */
const BLANK =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';

let __lazyObserver = null;
function ensureLazyObserver() {
  if (__lazyObserver || !('IntersectionObserver' in window)) return __lazyObserver;
  __lazyObserver = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      const el = e.target;
      const src = el.getAttribute('data-src');
      const srcset = el.getAttribute('data-srcset');
      if (src) el.src = src;
      if (srcset) el.srcset = srcset;
      el.onload = () => el.classList.add('loaded');
      __lazyObserver.unobserve(el);
    }
  }, { root: null, rootMargin: '250px 0px', threshold: 0.01 });
  return __lazyObserver;
}

function lazyifyImg(img) {
  // если Observer не поддерживается — ставим src сразу
  const obs = ensureLazyObserver();
  const dataSrc = img.getAttribute('data-src');
  const dataSrcSet = img.getAttribute('data-srcset');
  if (!obs) {
    if (dataSrc) img.src = dataSrc;
    if (dataSrcSet) img.srcset = dataSrcSet;
    return;
  }
  // уже видимый в viewport главный img можно грузить сразу
  const rect = img.getBoundingClientRect?.();
  const immediately =
    rect && rect.top < (window.innerHeight || 0) + 100 && rect.bottom > -100;
  if (immediately) {
    const s = img.getAttribute('data-src');
    const ss = img.getAttribute('data-srcset');
    if (s) img.src = s;
    if (ss) img.srcset = ss;
    img.onload = () => img.classList.add('loaded');
    return;
  }
  obs.observe(img);
}

/* ——— пер-пользовательские ключи ——— */
function k(base){
  try{ const uid = getUID?.() || 'guest'; return `${base}__${uid}`; }
  catch{ return `${base}__guest`; }
}

/* Может ли пользователь получить буст x2 на 1-й заказ */
function hasFirstOrderBoost(){
  try{
    const ref = JSON.parse(localStorage.getItem(k('ref_profile')) || '{}');
    const firstDone = !!ref.firstOrderDone;
    const boost = !!ref.firstOrderBoost;
    return boost && !firstDone;
  }catch{ return false; }
}

function findCategoryBySlug(slug){
  for (const g of state.categories){
    if (g.slug === slug) return g;
    for (const ch of (g.children||[])){
      if (ch.slug === slug) return ch;
    }
  }
  return null;
}
function categoryNameBySlug(slug){
  return findCategoryBySlug(slug)?.name || '';
}

/* ========= МАЛЕНЬКАЯ ДИАГНОСТИКА ДЛЯ ФИКС-ХЕДЕРА (опционально) ========= */
const PHDBG = {
  enabled: false,
  panel: null,
  init(){
    try{
      this.enabled = Boolean(
        window.DEBUG_PRODUCT_HDR ||
        localStorage.DEBUG_PRODUCT_HDR === '1'
      );
    }catch{}
    if (!this.enabled) return;

    const wrap = document.createElement('div');
    wrap.id = 'ph-diag';
    wrap.style.cssText = `
      position:fixed; right:10px; bottom:10px; z-index:99999;
      display:grid; gap:6px; padding:10px; border:1px solid #ddd;
      background:#fff; color:#111; border-radius:10px; font:12px/1.3 system-ui;
      box-shadow:0 6px 20px rgba(0,0,0,.18);
    `;
    wrap.innerHTML = `
      <b style="font-weight:800">PH-Diag</b>
      <div id="ph-state" style="max-width:280px; word-break:break-word"></div>
      <div style="display:flex; gap:6px; flex-wrap:wrap">
        <button id="ph-dump"   style="padding:6px 10px; border:1px solid #bbb; border-radius:8px; cursor:pointer; background:#f6f6f6">Dump</button>
        <button id="ph-clear"  style="padding:6px 10px; border:1px solid #bbb; border-radius:8px; cursor:pointer; background:#f6f6f6">Clear logs</button>
      </div>
    `;
    document.body.appendChild(wrap);
    this.panel = wrap;

    wrap.querySelector('#ph-dump')?.addEventListener('click', ()=> this.dumpNow());
    wrap.querySelector('#ph-clear')?.addEventListener('click', ()=>{ console.clear(); this.note('Console cleared'); });

    this.renderState();
    this.note('PH-Diag initialized');
  },

  renderState(){
    if (!this.panel) return;
    const s = document.querySelector('.app-header');
    const f = document.getElementById('productFixHdr');
    const btnB = document.getElementById('btnFixBack');
    const btnF = document.getElementById('btnFixFav');
    const sc = Math.max(document.documentElement.scrollTop||0, window.scrollY||0);
    const html = `
      scrollY=${sc}
      <br>stat(.app-header): ${s? 'OK' : '—'} ${s? `hidden=${s.classList.contains('hidden')}`:''}
      <br>fix(#productFixHdr): ${f? 'OK' : '—'} ${f? `show=${f.classList.contains('show')} z=${getComputedStyle(f).zIndex}`:''}
      <br>btnBack: ${btnB? 'OK':'—'}&nbsp;&nbsp;btnFav: ${btnF? 'OK':'—'}
    `;
    this.panel.querySelector('#ph-state').innerHTML = html;
  },

  dumpNow(){
    const s = document.querySelector('.app-header');
    const f = document.getElementById('productFixHdr');
    const dumpEl = (el, name)=> el ? {
      name,
      exists: true,
      classList: [...el.classList],
      style: getComputedStyle(el),
      bbox: el.getBoundingClientRect(),
      ariaHidden: el.getAttribute('aria-hidden'),
    } : { name, exists:false };
    const data = {
      scroll: { y: Math.max(document.documentElement.scrollTop||0, window.scrollY||0) },
      stat: dumpEl(s, 'app-header'),
      fix: dumpEl(f, 'productFixHdr'),
      btnBack: dumpEl(document.getElementById('btnFixBack'), 'btnFixBack'),
      btnFav:  dumpEl(document.getElementById('btnFixFav'),  'btnFixFav'),
    };
    console.log('[PH dump]', data);
    this.note('Dump printed to console');
  },

  note(msg, extra){
    try{
      console.log(`[PH] ${msg}`, extra||'');
      navigator.vibrate?.(10);
    }catch{}
  }
};

/* ==== вспомогалки для лоадера в этом модуле ==== */
function waitImageLoad(img, timeoutMs=1200){
  return new Promise((resolve)=>{
    if (!img) return resolve();
    if (img.complete && img.naturalWidth>0) return resolve();
    let done=false;
    const on = ()=>{ if(done) return; done=true; clear(); resolve(); };
    const to = setTimeout(on, timeoutMs);
    const clear=()=>{
      clearTimeout(to);
      img.removeEventListener('load', on);
      img.removeEventListener('error', on);
    };
    img.addEventListener('load', on, { once:true });
    img.addEventListener('error', on, { once:true });
  });
}

/* ========= РЕНДЕР СТРАНИЦЫ ТОВАРА ========= */
export async function renderProduct({id}){
  const p = state.products.find(x=> String(x.id)===String(id));
  if (!p){ location.hash='#/'; return; }

  // Быстрый «анти-дрожь» прокрутки при входе на карточку
  try { ScrollReset.request(); } catch {}

  // Покажем лоадер на время первичного рендера и ожидания главного изображения
  await Loader.wrap(async () => {
    const favActive = isFav(p.id);

    activateProductFixHeader({
      isFav: () => isFav(p.id),
      onBack: () => {
        try { ScrollReset.quiet(400); } catch {}
        history.back();
      },
      onFavToggle: () => {
        try { ScrollReset.quiet(900); } catch {}
        const now = toggleFav(p.id);
        const heroFav = document.getElementById('favBtn');
        if (heroFav) {
          heroFav.classList.toggle('active', now);
          heroFav.setAttribute('aria-pressed', now ? 'true' : 'false');
        }
        setFixFavActive(now);
        window.dispatchEvent(new CustomEvent('fav:changed', { detail: { id: p.id, active: now } }));
      },
      showThreshold: 20,
    });

    // ✅ Нормализация источников изображений
    const images = Array.isArray(p.images) ? p.images : (p.images ? [p.images] : []);
    const realPhotos = Array.isArray(p.realPhotos) ? p.realPhotos : [];

    const gallery = [
      ...images.map(src => ({ src, isReal:false })),
      ...realPhotos.map(src => ({ src, isReal:true })),
    ];
    const first = gallery[0] || { src:'', isReal:false };

    // Подбор «Похожие»
    const related = state.products
      .filter(x => x.categoryId === p.categoryId && String(x.id) !== String(p.id))
      .slice(0, 12);

    // 🔹 метка категории для заголовка
    const catLabel = categoryNameBySlug(p.categoryId) || '';

    const v=document.getElementById('view');
    v.innerHTML = `
      <style>
        /* эффекты загрузки */
        img.lazy { filter: blur(10px); transform: scale(1.02); transition: filter .25s ease, transform .25s ease; }
        img.lazy.loaded { filter: blur(0); transform: scale(1); }

        /* ===== Заголовок + подкатегория в строку ===== */
        .p-title{
          display:flex; align-items:baseline; gap:8px;
          font-weight:900; font-size:clamp(18px,5.2vw,22px);
        }
        .p-title .p-name{ color:var(--text); }
        .p-title .p-cat{
          font-weight:800; opacity:.55; /* тише названия */
        }
        @media (prefers-color-scheme:dark){
          .p-title .p-cat{ opacity:.65; }
        }

        /* ===== Кэшбек ===== */
        .p-cashback{display:flex;align-items:center;gap:10px;margin:8px 0;padding:12px 14px;border-radius:14px;background:linear-gradient(135deg,#f59e0b 0%,#ef4444 100%);color:#fff;max-width:100%;}
        .p-cashback i[data-lucide="coins"]{flex:0 0 auto;width:20px;height:20px;opacity:.95;}
        .p-cb-line{display:flex;align-items:center;gap:8px;white-space:nowrap;overflow:visible;font-weight:800;font-size:clamp(12px,3.6vw,16px);line-height:1.2;}
        .p-cb-pts{font-variant-numeric:tabular-nums;}
        .p-cb-x2{flex:0 0 auto;font-size:.78em;line-height:1;padding:3px 7px;border-radius:999px;background:rgba(255,255,255,.18);border:1px solid rgba(255,255,255,.28);font-weight:800;}
        .p-cb-help{margin-left:auto;display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:999px;background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.28);transition:filter .15s ease;}
        .p-cb-help svg{width:16px;height:16px;stroke:#fff;}
        @media(hover:hover){.p-cb-help:hover{filter:brightness(1.05);} }

        /* ===== Срок доставки ===== */
        .p-delivery{display:flex;align-items:center;gap:10px;margin:6px 0 12px;padding:10px 12px;border-radius:12px;background:#ffffff;color:#0f172a;border:1px solid rgba(15,23,42,.12);}
        .p-delivery svg{width:18px;height:18px;stroke:currentColor;opacity:1;}
        .p-delivery__title{font-weight:800;margin-right:4px;color:#0b1220;}
        .p-delivery .muted{color:#0b1220;opacity:1;font-weight:800;}
        @media (prefers-color-scheme:dark){
          .p-delivery{background:#111827;border-color:rgba(255,255,255,.14);color:#ffffff;}
          .p-delivery__title{color:#ffffff;}
          .p-delivery .muted{color:#ffffff;opacity:1;}
        }

        /* ===== Бейдж «Реальное фото товара» ===== */
        .real-badge{
          position:absolute; right:10px; bottom:10px; z-index:2;
          display:inline-flex; align-items:center; gap:6px;
          padding:8px 10px; border-radius:999px;
          font-size:12px; font-weight:800; line-height:1;
          color:#0f172a;
          background:rgba(255,255,255,.72);
          backdrop-filter:saturate(1.4) blur(8px);
          -webkit-backdrop-filter:saturate(1.4) blur(8px);
          border:1px solid rgba(15,23,42,.12);
          box-shadow:0 8px 24px rgba(15,23,42,.12);
          letter-spacing:.2px;
        }
        .real-badge i{ width:14px; height:14px; opacity:.9; stroke-width:2.2; }
        @media (prefers-color-scheme:dark){
          .real-badge{
            color:#fff;
            background:rgba(11,18,32,.66);
            border-color:rgba(255,255,255,.18);
            box-shadow:0 8px 24px rgba(0,0,0,.35);
          }
        }
        .thumb .real-dot{
          position:absolute; left:6px; top:6px; z-index:1;
          font-size:10px; font-weight:900; letter-spacing:.3px;
          padding:3px 7px; border-radius:999px;
          background:#ffffff; color:#0f172a; border:1px solid rgba(15,23,42,.12);
        }
        @media (prefers-color-scheme:dark){
          .thumb .real-dot{ background:#0b1220; color:#fff; border-color:rgba(255,255,255,.18); }
        }

        /* ===== Раздел «Похожие» ===== */
        .related-wrap{margin:18px -12px -8px;padding:14px 12px 10px;background:linear-gradient(0deg,rgba(15,23,42,.04),rgba(15,23,42,.04));border-top:1px solid rgba(15,23,42,.10);}
        .related-head{display:flex;align-items:center;gap:8px;margin:0 0 8px;font-weight:800;font-size:clamp(16px,4.2vw,18px);}
        .related-head i{width:18px;height:18px;opacity:.9;}
        @media (prefers-color-scheme:dark){
          .related-wrap{background:linear-gradient(0deg,rgba(255,255,255,.04),rgba(255,255,255,.04));border-top-color:rgba(255,255,255,.14);}
        }
        .grid.related-grid{margin-top:6px;}

        /* Контейнер миниатюр: убрать скругление нижних углов */
        .p-hero .thumbs{
          border-bottom-left-radius: 0 !important;
          border-bottom-right-radius: 0 !important;
          overflow: hidden;
        }

        /* ====== СВОТЧИ И РАЗМЕРЫ ====== */
        .p-options{ display:grid; grid-template-columns:1fr; gap:16px; margin:14px 0; }
        .opt-title{ font-weight:800; margin:6px 0 8px; }
        .sizes,.colors{ display:flex; flex-wrap:wrap; gap:10px; }

        /* — Цвета — */
        .sw{
          position:relative; width:38px; height:38px; border-radius:999px;
          border:2px solid rgba(15,23,42,.18);
          box-shadow: inset 0 0 0 2px rgba(255,255,255,.7);
          outline:none; cursor:pointer;
          transition:transform .12s ease, box-shadow .12s ease, border-color .12s ease, outline-color .12s ease;
        }
        @media (prefers-color-scheme:dark){
          .sw{ border-color: rgba(255,255,255,.22); box-shadow: inset 0 0 0 2px rgba(0,0,0,.55); }
        }
        .sw:focus-visible{ outline:3px solid #0ea5e9; outline-offset:2px; }
        .sw:hover{ transform:translateY(-1px); }

        @keyframes swPulse { from{ transform:scale(1.04); } to{ transform:scale(1); } }
        .sw.active{
          border-color:#0ea5e9 !important;
          box-shadow: inset 0 0 0 2px rgba(255,255,255,.85), 0 0 0 3px rgba(14,165,233,.28);
          animation: swPulse .25s ease;
        }

        .size{ padding:10px 14px; border:1px solid var(--stroke); border-radius:999px; background:#fff; font-weight:700; cursor:pointer; }
        .size:focus-visible{ outline:2px solid #121111; outline-offset:3px; }
        .size.active{ background:#121111; color:#fff; border-color:#121111; }

        .table-wrap{ overflow:auto; -webkit-overflow-scrolling:touch; margin-top:10px; border:1px solid var(--stroke); border-radius:16px; }
        .size-table{ width:100%; border-collapse:separate; border-spacing:0; }
        .size-table th,.size-table td{ padding:10px 12px; white-space:nowrap; font-size:14px; text-align:center; font-variant-numeric: tabular-nums; }
        .size-table thead th{ background:#f8f8f8; font-weight:800; text-align:center; }
        .size-table th:first-child, .size-table td:first-child{ text-align:left; }
        .size-table tbody tr:not(:last-child) td{ border-bottom:1px solid var(--stroke); }
      </style>

      <div class="product">
        <!-- ГАЛЕРЕЯ -->
        <div class="p-hero">
          <div class="gallery" role="region" aria-label="Галерея товара">
            <div class="gallery-main">
              ${first.isReal ? `<span class="real-badge"><i data-lucide="camera"></i><span>Реальное фото товара</span></span>` : ``}
              <!-- главный кадр: грузим сразу (без data-src) -->
              <img id="mainImg" class="zoomable" src="${first.src||''}" alt="${escapeHtml(p.title)}${first.isReal?' (реальное фото)':''}">
              <button class="hero-btn hero-back" id="goBack" aria-label="Назад"><i data-lucide="chevron-left"></i></button>
              <button class="hero-btn hero-fav ${favActive?'active':''}" id="favBtn" aria-pressed="${favActive?'true':'false'}" aria-label="В избранное"><i data-lucide="heart"></i></button>
            </div>

            ${gallery.length>1 ? `
            <div class="thumbs" id="thumbs" role="tablist" aria-label="Миниатюры">
              ${gallery.map((it, i)=>`
                <button class="thumb ${i===0?'active':''}" role="tab" aria-selected="${i===0?'true':'false'}" data-index="${i}" aria-controls="mainImg" style="position:relative">
                  ${it.isReal ? `<span class="real-dot">LIVE</span>` : ``}
                  <img class="lazy" src="${BLANK}" data-src="${it.src}" alt="${escapeHtml(`Фото ${i+1}${it.isReal?' (реальное)':''}`)}" loading="lazy">
                </button>
              `).join('')}
            </div>` : '' }
          </div>
        </div>

        <div class="p-body home-bottom-pad">
          <div class="p-title">
            <span class="p-name">${escapeHtml(p.title)}</span>
            ${catLabel ? `<span class="p-cat">${escapeHtml(catLabel)}</span>` : ``}
          </div>

          <!-- Кэшбек -->
          <div class="p-cashback" role="note" aria-label="Информация о кэшбеке">
            <i data-lucide="coins" aria-hidden="true"></i>
            ${cashbackSnippetHTML(p.price)}
            <button id="cbHelpBtn" class="p-cb-help" type="button" aria-label="Как работает кэшбек?">
              <i data-lucide="help-circle"></i>
            </button>
          </div>

          <!-- Срок доставки -->
          <div class="p-delivery" role="note" aria-label="Срок доставки">
            <i data-lucide="clock"></i>
            <span class="p-delivery__title">Срок доставки:</span>
            <span class="muted"><b>14–16 дней</b></span>
          </div>

          <!-- Опции -->
          <div class="p-options">
            ${(p.sizes?.length||0) ? `
            <div>
              <div class="opt-title" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
                <span>Размер</span>
                ${p.sizeChart ? `<button id="btnSizeCalc" class="pill small" type="button"><i data-lucide="ruler"></i><span>Подобрать размер</span></button>` : ``}
              </div>
              <div class="sizes" id="sizes">${p.sizes.map(s=>`<button class="size" data-v="${s}">${s}</button>`).join('')}</div>
              ${!p.sizeChart ? `<div class="muted" style="font-size:12px;margin-top:6px">Таблица размеров недоступна для этого товара.</div>` : ``}
            </div>`:''}
            <div>
              <div class="opt-title">Цвет</div>
              <div class="colors" id="colors">
                ${(p.colors||[]).map((c,i)=>`
                  <button
                    class="sw${i===0?' active':''}"
                    title="${c}${i===0?' — выбран':''}"
                    aria-label="Цвет ${c}${i===0?' — выбран':''}"
                    aria-pressed="${i===0?'true':'false'}"
                    data-v="${c}"
                    style="background:${colorToHex(c)}"
                  ></button>
                `).join('')}
              </div>
            </div>
          </div>

          ${p.sizeChart ? `
          <div class="opt-title" style="margin-top:8px">Размерная сетка</div>
          <div class="table-wrap">
            <table class="size-table">
              <thead><tr>${p.sizeChart.headers.map(h=>`<th>${escapeHtml(h)}</th>`).join('')}</tr></thead>
              <tbody>
                ${p.sizeChart.rows.map(r=>`<tr>${r.map(c=>`<td>${escapeHtml(String(c))}</td>`).join('')}</tr>`).join('')}
              </tbody>
            </table>
          </div>`:''}

          <!-- БЛОК «Похожие» -->
          ${related.length ? `
          <section class="related-wrap" aria-label="Похожие товары">
            <div class="related-head">
              <i data-lucide="sparkles" aria-hidden="true"></i>
              <span>Похожие</span>
            </div>
            <div class="grid related-grid" id="relatedGrid"></div>
          </section>` : ''}

        </div>
      </div>`;

    window.lucide?.createIcons && lucide.createIcons();

    // ЛЕНИВАЯ ИНИЦИАЛИЗАЦИЯ: миниатюры
    document.querySelectorAll('#thumbs img[data-src]').forEach(lazyifyImg);

    // отрисовать «Похожие»
    drawRelatedCards(related);

    // help modal
    document.getElementById('cbHelpBtn')?.addEventListener('click', showCashbackHelpModal);

    // Size calculator open
    document.getElementById('btnSizeCalc')?.addEventListener('click', ()=> openSizeCalculator(p));

    const needSize = Array.isArray(p.sizes) && p.sizes.length>0;
    let size=null, color=(p.colors||[])[0]||null;

    const sizes=document.getElementById('sizes');
    if (sizes){
      sizes.addEventListener('click', e=>{
        const b=e.target.closest('.size'); if(!b)return;
        sizes.querySelectorAll('.size').forEach(x=>x.classList.remove('active'));
        b.classList.add('active'); size=b.getAttribute('data-v');
        refreshCTAByState();
      });
    }
    const colors=document.getElementById('colors');
    if (colors){
      colors.addEventListener('click', e=>{
        const b=e.target.closest('.sw'); if(!b)return;
        colors.querySelectorAll('.sw').forEach(x=>{
          x.classList.remove('active');
          x.setAttribute('aria-pressed','false');
          const t = x.getAttribute('title')||'';
          x.setAttribute('title', t.replace(' — выбран',''));
          const al = x.getAttribute('aria-label')||'';
          x.setAttribute('aria-label', al.replace(' — выбран',''));
        });
        b.classList.add('active');
        b.setAttribute('aria-pressed','true');
        b.setAttribute('title', (b.getAttribute('title')||'') + ' — выбран');
        b.setAttribute('aria-label', (b.getAttribute('aria-label')||'') + ' — выбран');
        color=b.getAttribute('data-v');
        refreshCTAByState();
      });
    }

    const heroBack = document.getElementById('goBack');
    if (heroBack) {
      heroBack.addEventListener('click', (e) => {
        e.preventDefault();
        try { ScrollReset.quiet(400); } catch {}
        history.back();
      }, { passive: false });
    }

    // === Глобальный синк избранного
    function onFavSync(ev){
      try{
        const evId = String(ev?.detail?.id ?? '');
        if (evId && evId !== String(p.id)) return;

        const on = !!isFav(p.id);

        const heroFav = document.getElementById('favBtn');
        if (heroFav) {
          heroFav.classList.toggle('active', on);
          heroFav.setAttribute('aria-pressed', String(on));
        }

        setFixFavActive(on);
      }catch{}
    }
    window.addEventListener('fav:changed', onFavSync);

    const favBtn = document.getElementById('favBtn');
    if (favBtn) {
      favBtn.addEventListener('click', (e) => {
        e.preventDefault();
        try { ScrollReset.quiet(900); } catch {}
        const nowActive = toggleFav(p.id);

        favBtn.classList.toggle('active', nowActive);
        favBtn.setAttribute('aria-pressed', String(nowActive));
        setFixFavActive(nowActive);

        window.dispatchEvent(new CustomEvent('fav:changed', {
          detail: { id: p.id, active: nowActive }
        }));
      }, { passive:false });
    }

    // Галерея
    const thumbs = document.getElementById('thumbs');
    const mainImg = document.getElementById('mainImg');
    const galleryMain = document.querySelector('.gallery-main');
    if (thumbs && mainImg && gallery.length){
      thumbs.addEventListener('click', (e)=>{
        const t = e.target.closest('button.thumb'); if (!t) return;
        const idx = Number(t.getAttribute('data-index'))||0;
        const it = gallery[idx] || gallery[0];

        // если миниатюра ещё не прогружена — тянем src из data-src
        const thumbImg = t.querySelector('img');
        if (thumbImg && thumbImg.getAttribute('data-src') && thumbImg.src === BLANK) {
          thumbImg.src = thumbImg.getAttribute('data-src');
          thumbImg.removeAttribute('data-src');
          thumbImg.classList.add('loaded');
        }

        mainImg.src = it.src || '';
        mainImg.alt = `${p.title}${it.isReal ? ' (реальное фото)' : ''}`;

        const old = galleryMain.querySelector('.real-badge');
        if (old) old.remove();
        if (it.isReal){
          const b = document.createElement('span');
          b.className='real-badge';
          b.innerHTML = '<i data-lucide="camera"></i><span>Реальное фото товара</span>';
          galleryMain.appendChild(b);
          window.lucide?.createIcons && lucide.createIcons();
        }
        thumbs.querySelectorAll('.thumb').forEach(x=>{
          x.classList.toggle('active', x===t);
          x.setAttribute('aria-selected', x===t ? 'true':'false');
        });
        resetZoom();
      });
    }

    /* -------- CTA в таббаре -------- */
    function showAddCTA(){
      const needPick = needSize && !size;
      window.setTabbarCTA?.({
        id: 'ctaAdd',
        html: `<i data-lucide="shopping-bag"></i><span>${needPick ? 'Выберите размер' : 'Добавить в корзину&nbsp;|&nbsp;'+priceFmt(p.price)}</span>`,
        onClick(){
          if (needSize && !size){
            document.getElementById('sizes')?.scrollIntoView({ behavior:'smooth', block:'center' });
            return;
          }
          addToCart(p, size, color, 1);
          showInCartCTAs();
        }
      });
      const btn = document.getElementById('ctaAdd');
      if (btn) btn.disabled = needPick;
    }

    function showInCartCTAs(){
      window.setTabbarCTAs?.(
        { html:`<i data-lucide="x"></i><span>Убрать из корзины</span>`,
          onClick(){ removeLineFromCart(p.id, size||null, color||null); showAddCTA(); } },
        { html:`<i data-lucide="shopping-bag"></i><span>Перейти в корзину</span>`,
          onClick(){ location.hash = '#/cart'; } }
      );
    }

    function refreshCTAByState(){
      if (needSize && !size){ showAddCTA(); return; }
      if (isInCart(p.id, size||null, color||null)) showInCartCTAs(); else showAddCTA();
    }
    refreshCTAByState();

    /* -------- Зум -------- */
    ensureZoomOverlay();
    initZoomableInPlace(mainImg);
    document.querySelectorAll('img.zoomable').forEach(img=>{
      img.addEventListener('click', ()=> openZoomOverlay(img.src));
    });
    function resetZoom(){ if (!mainImg) return; mainImg.style.transform=''; mainImg.dataset.zoom='1'; }

    /* -------- Диагностика (опционально) -------- */
    if (PHDBG.enabled) PHDBG.init();

    /* -------- Авто-деактивация фикс-хедера при уходе -------- */
    const _onHashChange = () => {
      const h = String(location.hash || '');
      const leavingProduct = !h.startsWith('#/product/') && !h.startsWith('#/p/');
      if (leavingProduct) {
        deactivateProductFixHeader();
        window.removeEventListener('hashchange', _onHashChange);
        window.removeEventListener('fav:changed', onFavSync);
      }
    };
    window.addEventListener('hashchange', _onHashChange);

    // Дождаться первичной загрузки главного кадра (или таймаут) внутри лоадера
    await waitImageLoad(document.getElementById('mainImg'), 1200);

    // Сообщим, что экран готов (важно для второго хедера)
    try {
      window.dispatchEvent(new CustomEvent('view:product-mounted', { detail: { id: p.id } }));
    } catch {}
  }, 'Загружаем товар…'); // подпись лоадера
}

/* ===== карточки «Похожие» — ленивые картинки ===== */
function drawRelatedCards(list){
  const grid = document.getElementById('relatedGrid');
  if (!grid) return;
  grid.innerHTML = '';

  const frag = document.createDocumentFragment();
  for (const p of list){
    const t = document.getElementById('product-card');
    if (t && t.content?.firstElementChild){
      const node = t.content.firstElementChild.cloneNode(true);
      node.href = `#/product/${p.id}`;

      const im = node.querySelector('img');
      if (im){
        im.classList.add('lazy');
        im.src = BLANK;
        im.setAttribute('data-src', p.images?.[0] || '');
        im.alt = p.title;
        lazyifyImg(im);
      }

      const titleEl = node.querySelector('.title');
      if (titleEl) titleEl.textContent = p.title;

      const subEl = node.querySelector('.subtitle');
      if (subEl) {
        const labelById = categoryNameBySlug(p.categoryId) || '';
        subEl.textContent = p.categoryLabel || labelById;
      }

      const priceEl = node.querySelector('.price');
      if (priceEl) priceEl.textContent = priceFmt(p.price);

      const favBtn = node.querySelector('button.fav, .fav');
      if (favBtn){
        const active = isFav(p.id);
        favBtn.classList.toggle('active', active);
        favBtn.setAttribute('aria-pressed', String(active));
        favBtn.onclick = (ev)=>{ ev.preventDefault(); toggleFav(p.id); };
      }

      frag.appendChild(node);
    } else {
      const a = document.createElement('a');
      a.href = `#/product/${p.id}`;
      a.className = 'card';
      a.innerHTML = `
        <img class="lazy" src="${BLANK}" data-src="${p.images?.[0]||''}" alt="${escapeHtml(p.title)}">
        <div class="title">${escapeHtml(p.title)}</div>
        <div class="price">${priceFmt(p.price)}</div>
      `;
      frag.appendChild(a);
    }
  }

  grid.appendChild(frag);
  // Подписываем все ленивые изображения в блоке «Похожие»
  grid.querySelectorAll('img.lazy[data-src]').forEach(lazyifyImg);

  window.lucide?.createIcons && lucide.createIcons();
}

/* ===== Кэшбек бейдж ===== */
function cashbackSnippetHTML(price){
  const boost = hasFirstOrderBoost();
  const rate = boost ? CASHBACK_RATE_BOOST : CASHBACK_RATE_BASE;
  const pts  = Math.floor((Number(price)||0) * rate);
  return `
    <div class="p-cb-line">
      <span>Кэшбек</span>
      +<span class="p-cb-pts">${pts}</span>&nbsp;баллов
      ${boost ? `<span class="p-cb-x2" title="x2 на первый заказ">x2</span>` : ``}
    </div>`;
}

/* ==== МОДАЛКА «Как работает кэшбек» ==== */
function showCashbackHelpModal(){
  const modal = document.getElementById('modal');
  const mb = document.getElementById('modalBody');
  const mt = document.getElementById('modalTitle');
  const ma = document.getElementById('modalActions');
  if (!modal || !mb || !mt || !ma) return;

  mt.textContent = 'Как работает кэшбек';
  mb.innerHTML = `
    <style>
      .cb-how{ display:grid; gap:10px; }
      .cb-row{ display:grid; grid-template-columns:24px 1fr; gap:10px; align-items:start; }
      .cb-row i{ width:20px; height:20px; }
      .muted{ color:var(--muted,#6b7280); }
    </style>
    <div class="cb-how">
      <div class="cb-row">
        <i data-lucide="percent"></i>
        <div><b>Начисляем за покупку.</b> Сумма кэшбека зависит от цены товара.</div>
      </div>
      <div class="cb-row">
        <i data-lucide="clock"></i>
        <div><b>Зачисление через 24 часа.</b> После этого баллы доступны к оплате.</div>
      </div>
      <div class="cb-row">
        <i data-lucide="badge-check"></i>
        <div><b>Как использовать.</b> На этапе оформления можно оплатить часть заказа баллами. Ваш баланс можно увидеть в корзине.</div>
      </div>
      <div class="cb-row">
        <i data-lucide="zap"></i>
        <div class="muted">Если вы пришли по реф-ссылке, на <b>первый заказ — x2 кэшбек</b>.</div>
      </div>
    </div>
  `;
  ma.innerHTML = `<button id="cbHelpOk" class="pill primary">Понятно</button>`;
  modal.classList.add('show');
  window.lucide?.createIcons && lucide.createIcons();
  document.getElementById('modalClose')?.addEventListener('click', close, { once:true });
  document.getElementById('cbHelpOk')?.addEventListener('click', close, { once:true });

  function close(){ modal.classList.remove('show'); }
}

/* ==== вспомогалки ==== */
function escapeHtml(s=''){
  return String(s).replace(/[&<>"']/g, m=> ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

/* ===== ЗУМ ВНУТРИ БЛОКА ===== */
function initZoomableInPlace(img){
  if (!img) return;
  let scale = 1, startDist = 0, startScale = 1, dragging=false, lastX=0, lastY=0, tx=0, ty=0, lastTap=0;

  img.addEventListener('wheel', (e)=>{
    e.preventDefault();
    const rect = img.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const delta = -Math.sign(e.deltaY) * 0.2;
    zoomAt(mx, my, delta);
  }, {passive:false});

  img.addEventListener('click', (e)=>{
    const now = Date.now();
    if (now - lastTap < 300){
      const rect = img.getBoundingClientRect();
      zoomAt(e.clientX - rect.left, e.clientY - rect.top, scale>1 ? -999 : 1.5);
      e.preventDefault();
    }
    lastTap = now;
  });

  img.addEventListener('mousedown', (e)=>{ if (scale<=1) return;
    dragging=true; lastX=e.clientX; lastY=e.clientY; e.preventDefault();
  });
  window.addEventListener('mousemove', (e)=>{ if(!dragging) return;
    const dx=e.clientX-lastX, dy=e.clientY-lastY; lastX=e.clientX; lastY=e.clientY; tx+=dx; ty+=dy; apply();
  });
  window.addEventListener('mouseup', ()=> dragging=false);

  img.addEventListener('touchstart', (e)=>{
    if (e.touches.length===2){
      startDist = dist(e.touches[0], e.touches[1]);
      startScale = scale;
    }else if (e.touches.length===1 && scale>1){
      dragging=true; lastX=e.touches[0].clientX; lastY=e.touches[0].clientY;
    }
  }, {passive:true});

  img.addEventListener('touchmove', (e)=>{
    if (e.touches.length===2){
      e.preventDefault();
      const d = dist(e.touches[0], e.touches[1]);
      const deltaScale = (d/startDist) - 1;
      scale = clamp(startScale*(1+deltaScale), 1, 5);
      apply();
    }else if (e.touches.length===1 && dragging){
      e.preventDefault();
      const dx=e.touches[0].clientX-lastX, dy=e.touches[0].clientY-lastY;
      lastX=e.touches[0].clientX; lastY=e.touches[0].clientY;
      tx+=dx; ty+=dy; apply();
    }
  }, {passive:false});

  img.addEventListener('touchend', ()=>{ dragging=false; });

  function zoomAt(x,y, delta){
    const old = scale;
    scale = clamp(scale + delta, 1, 5);
    tx -= (x - (x - tx)) * (scale/old - 1);
    ty -= (y - (y - ty)) * (scale/old - 1);
    apply();
  }
  function apply(){
    if (scale<=1){ scale=1; tx=0; ty=0; }
    img.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
  }
  function clamp(v,min,max){ return Math.max(min, Math.min(max, v)); }
  function dist(a,b){ const dx=a.clientX-b.clientX, dy=a.clientY-b.clientY; return Math.hypot(dx,dy); }
}

/* ===== ФУЛЛСКРИН-ОВЕРЛЕЙ ДЛЯ ФОТО ===== */
function ensureZoomOverlay(){
  if (document.getElementById('zoomOverlay')) return;
  const wrap = document.createElement('div');
  wrap.id='zoomOverlay';
  wrap.className='zoom-overlay';
  wrap.innerHTML = `
    <div class="zoom-stage">
      <img id="zoomImg" alt="">
      <button class="zoom-close" id="zoomClose" aria-label="Закрыть"><i data-lucide="x"></i></button>
    </div>
  `;
  document.body.appendChild(wrap);
  window.lucide?.createIcons && lucide.createIcons();
}

function openZoomOverlay(src){
  const ov = document.getElementById('zoomOverlay');
  const img = document.getElementById('zoomImg');
  const close = document.getElementById('zoomClose');
  if (!ov || !img) return;
  img.src = src; ov.classList.add('show');

  let scale=1, startScale=1, startDist=0, tx=0, ty=0, dragging=false, lastX=0, lastY=0, lastTap=0;

  function apply(){ img.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`; }
  function clamp(v,min,max){ return Math.max(min, Math.min(max, v)); }
  function dist(a,b){ const dx=a.clientX-b.clientX, dy=a.clientY-b.clientY; return Math.hypot(dx,dy); }

  img.onwheel = (e)=>{ e.preventDefault(); const delta=-Math.sign(e.deltaY)*0.2; scale=clamp(scale+delta,1,6); apply(); };
  img.onmousedown = (e)=>{ if(scale<=1) return; dragging=true; lastX=e.clientX; lastY=e.clientY; e.preventDefault(); };
  window.onmousemove = (e)=>{ if(!dragging) return; const dx=e.clientX-lastX, dy=e.clientY-lastY; lastX=e.clientX; lastY=e.clientY; tx+=dx; ty+=dy; apply(); };
  window.onmouseup = ()=> dragging=false;

  img.ontouchstart = (e)=>{
    if(e.touches.length===2){
      startDist = dist(e.touches[0], e.touches[1]); startScale=scale;
    }else if(e.touches.length===1 && scale>1){
      dragging=true; lastX=e.touches[0].clientX; lastY=e.touches[0].clientY;
    }
  };
  img.ontouchmove = (e)=>{
    if(e.touches.length===2){ e.preventDefault(); const d=dist(e.touches[0], e.touches[1]); const ds=(d/startDist)-1; scale=clamp(startScale*(1+ds),1,6); apply(); }
    else if(e.touches.length===1 && dragging){ e.preventDefault(); const dx=e.touches[0].clientX-lastX, dy=e.touches[0].clientY-lastY; lastX=e.touches[0].clientX; lastY=e.touches[0].clientY; tx+=dx; ty+=dy; apply(); }
  };
  img.ontouchend = ()=>{ dragging=false; };

  img.onclick = (e)=>{
    const now=Date.now();
    if(now-lastTap<300){ scale = scale>1 ? 1 : 2; tx=0; ty=0; apply(); }
    lastTap=now;
  };

  function closeOv(){
    ov.classList.remove('show');
    img.onwheel = img.onmousedown = window.onmousemove = window.onmouseup = null;
    img.ontouchstart = img.ontouchmove = img.ontouchend = null;
    img.onclick = null; close.onclick = null;
  }
  close.onclick = closeOv;
  ov.onclick = (e)=>{ if(e.target===ov) closeOv(); };
}

/* ========= SIZE CALCULATOR ========= */

function inferSizeChartType(headers=[]) {
  const hs = headers.map(h=>String(h).toLowerCase());
  const shoeHints = ['стопа','длина стопы','foot','cm','mm','eu','us','uk','длина, см','eu size','eur'];
  const clothHints = ['груд','плеч','тал','бедр','waist','hip','hips','bust','chest','shoulder','sleeve','длина по спине','рост','height'];

  const hasShoe = hs.some(h=> shoeHints.some(k=> h.includes(k)));
  const hasCloth = hs.some(h=> clothHints.some(k=> h.includes(k)));

  if (hasShoe && !hasCloth) return 'shoes';
  if (hasCloth) return 'clothes';
  return 'clothes';
}

function openSizeCalculator(p){
  const modal = document.getElementById('modal');
  const mb = document.getElementById('modalBody');
  const mt = document.getElementById('modalTitle');
  const ma = document.getElementById('modalActions');
  if (!modal || !mb || !mt || !ma) return;

  const chart = p.sizeChart;
  if (!chart){ window.toast?.('Для этого товара таблица размеров недоступна'); return; }

  const type = inferSizeChartType(chart.headers || []);

  mt.textContent = 'Подбор размера';
  mb.innerHTML = `
    <style>
      .sz-form{ display:grid; gap:10px; }
      .sz-row{ display:grid; grid-template-columns:1fr 1fr; gap:10px; }
      .sz-row-3{ display:grid; grid-template-columns:1fr 1fr 1fr; gap:10px; }
      @media (max-width:520px){ .sz-row, .sz-row-3{ grid-template-columns:1fr; } }
      .sz-note{ color:var(--muted,#6b7280); font-size:12px; }
      .sz-res{ display:none; border:1px solid var(--stroke); border-radius:12px; padding:12px; }
      .sz-res.show{ display:block; }
      .sz-chip{ display:inline-flex; gap:6px; align-items:center; padding:6px 10px; border-radius:999px; border:1px solid var(--stroke); }
    </style>

    <div class="sz-form">
      ${type==='shoes' ? `
        <div class="field">
          <span>Длина стопы (см)</span>
          <input id="inFoot" class="input" type="number" step="0.1" min="10" max="35" placeholder="Например, 25.2">
          <div class="sz-note">Поставьте ногу на лист бумаги, отметьте самую длинную точку, измерьте линейкой.</div>
        </div>
      ` : `
        <div class="sz-row">
          <div class="field">
            <span>Грудь (см)</span>
            <input id="inBust" class="input" type="number" step="0.5" min="60" max="150" placeholder="Например, 92">
          </div>
          <div class="field">
            <span>Талия (см)</span>
            <input id="inWaist" class="input" type="number" step="0.5" min="50" max="140" placeholder="Например, 74">
          </div>
        </div>
        <div class="sz-row">
          <div class="field">
            <span>Бёдра (см)</span>
            <input id="inHips" class="input" type="number" step="0.5" min="70" max="160" placeholder="Например, 98">
          </div>
          <div class="field">
            <span>Рост (см)</span>
            <input id="inHeight" class="input" type="number" step="1" min="140" max="210" placeholder="Например, 175">
          </div>
        </div>
        <div class="field">
          <span>Вес (кг)</span>
          <input id="inWeight" class="input" type="number" step="0.5" min="35" max="160" placeholder="Например, 72.5">
          <div class="sz-note">Рост и вес помогают уточнить размер при граничных значениях.</div>
        </div>
      `}
      <div id="szResult" class="sz-res" role="status" aria-live="polite"></div>
    </div>
  `;

  ma.innerHTML = `
    <button id="szCancel" class="pill">Отмена</button>
    <button id="szCalc" class="pill primary">Рассчитать</button>
  `;

  modal.classList.add('show');
  window.lucide?.createIcons && lucide.createIcons();

  document.getElementById('szCancel')?.addEventListener('click', ()=> modal.classList.remove('show'), { once:true });
  document.getElementById('modalClose')?.addEventListener('click', ()=> modal.classList.remove('show'), { once:true });

  document.getElementById('szCalc')?.addEventListener('click', ()=>{
    const resBox = document.getElementById('szResult');

    const rec = (type==='shoes')
      ? computeShoeSize(chart, Number(document.getElementById('inFoot')?.value))
      : computeClothSize(
          chart,
          Number(document.getElementById('inBust')?.value),
          Number(document.getElementById('inWaist')?.value),
          Number(document.getElementById('inHips')?.value),
          Number(document.getElementById('inHeight')?.value),
          Number(document.getElementById('inWeight')?.value),
          Array.isArray(p.sizes) ? p.sizes.slice() : []
        );

    if (!resBox) return;

    if (!rec){
      resBox.classList.add('show');
      resBox.innerHTML = `<div>Нужный размер не найден. Проверьте мерки или ориентируйтесь на таблицу выше.</div>`;
      return;
    }

    resBox.classList.add('show');
    resBox.innerHTML = `
      <div style="display:grid; gap:8px">
        <div><b>Рекомендуемый размер:</b> <span class="sz-chip">${rec.size}</span></div>
        ${rec.reason ? `<div class="sz-note">${escapeHtml(rec.reason)}</div>` : ``}
        <div><button id="szApply" class="pill primary">Выбрать ${rec.size}</button></div>
      </div>
    `;

    document.getElementById('szApply')?.addEventListener('click', ()=>{
      const sizesEl = document.getElementById('sizes');
      const btn = sizesEl?.querySelector(`.size[data-v="${CSS.escape(rec.size)}"]`);
      if (btn){
        btn.click();
        btn.scrollIntoView({ behavior:'smooth', block:'center' });
      }
      modal.classList.remove('show');
    }, { once:true });
  });
}

/* === Подбор размера (обувь) === */
function computeShoeSize(chart, footCm){
  if (!footCm || !isFinite(footCm)) return null;

  const h = chart.headers || [];
  const idxLen = getColumnIndex(h, ['длина стопы','foot length','длина, см','см','cm','mm']);
  if (idxLen===-1) return null;

  const idxSize = guessSizeColIndex(h);

  let best = null, bestDiff = Infinity;
  for (const row of chart.rows || []){
    const lenRaw = row[idxLen];
    const len = takeNumber(lenRaw);
    if (!len) continue;
    const isMM = String(h[idxLen]).toLowerCase().includes('mm') || String(lenRaw).toLowerCase().includes('мм');
    const cm = isMM ? (len/10) : len;

    const diff = Math.abs(cm - footCm);
    if (diff < bestDiff){
      bestDiff = diff;
      best = { size: String(row[idxSize] ?? row[0] ?? '').trim(), reason: `Ближайшая длина стопы: ${cm.toFixed(1)} см` };
    }
  }
  return best;
}

/* === Подбор размера (одежда) === */
function computeClothSize(chart, bust, waist, hips, height, weight, sizesOrder=[]){
  const h = chart.headers || [];
  const idxSize   = guessSizeColIndex(h);
  if (idxSize===-1) return null;

  const idxBust   = getColumnIndex(h, ['грудь','обхват груди','bust','chest']);
  const idxWaist  = getColumnIndex(h, ['талия','обхват талии','waist']);
  const idxHips   = getColumnIndex(h, ['бедра','обхват бедер','hips','hip']);
  const idxHeight = getColumnIndex(h, ['рост','height']);

  if (idxBust===-1 && idxWaist===-1 && idxHips===-1 && (idxHeight===-1 || !height)) {
    return null;
  }

  let best=null, bestScore=Infinity, bestRow=null;
  let second=null, secondScore=Infinity, secondRow=null;
  let bestReasons='';

  for (const row of chart.rows || []){
    let score = 0, weightSum = 0;
    const rs = [];

    if (idxBust>-1 && bust){
      const v = closestOfCell(row[idxBust], bust);
      score += Math.abs(v - bust); weightSum += 1;
      rs.push(`грудь: ${isFinite(v)?v.toFixed(0):'—'} см`);
    }
    if (idxWaist>-1 && waist){
      const v = closestOfCell(row[idxWaist], waist);
      score += Math.abs(v - waist); weightSum += 1;
      rs.push(`талия: ${isFinite(v)?v.toFixed(0):'—'} см`);
    }
    if (idxHips>-1 && hips){
      const v = closestOfCell(row[idxHips], hips);
      score += Math.abs(v - hips); weightSum += 1;
      rs.push(`бёдра: ${isFinite(v)?v.toFixed(0):'—'} см`);
    }
    if (idxHeight>-1 && height){
      const v = closestOfCell(row[idxHeight], height);
      score += 0.5 * Math.abs(v - height); weightSum += 0.5;
      rs.push(`рост: ${isFinite(v)?v.toFixed(0):'—'} см`);
    }

    if (!weightSum) continue;
    const norm = score / weightSum;
    const sizeLabel = String(row[idxSize] ?? row[0] ?? '').trim();

    if (norm < bestScore){
      second = best; secondScore = bestScore; secondRow = bestRow;
      best = sizeLabel; bestScore = norm; bestRow = row; bestReasons = rs.join(', ');
    }else if (norm < secondScore){
      second = sizeLabel; secondScore = norm; secondRow = row;
    }
  }

  if (!best) return null;

  let finalSize = best;
  let adj = '';
  const close = isFinite(secondScore) && Math.abs(secondScore - bestScore) <= 1.8;
  const tallOrHeavy = (height && height >= 188) || (weight && weight >= 95);
  const shortOrLight = (height && height <= 160) || (weight && weight <= 50);

  if (close && sizesOrder && sizesOrder.length){
    const iBest = sizesOrder.indexOf(best);
    if (tallOrHeavy && iBest>-1 && iBest < sizesOrder.length-1){
      finalSize = sizesOrder[iBest+1];
      adj = ' (учли рост/вес — взяли на полразмера больше)';
    }else if (shortOrLight && iBest>-1 && iBest > 0){
      finalSize = sizesOrder[iBest-1];
      adj = ' (учли рост/вес — взяли на полразмера меньше)';
    }
  }

  if (!adj && idxHeight>-1 && height){
    if (height >= 190) adj = ' (рост высокий, ориентировались на длину/рост из таблицы)';
    else if (height <= 160) adj = ' (рост невысокий, ориентировались на длину/рост из таблицы)';
  }

  const reason = `Ближе всего по меркам: ${bestReasons}${adj}`;
  return { size: finalSize, reason };
}

/* == Утилиты для таблицы == */
function getColumnIndex(headers=[], keys=[]){
  const hs = headers.map(h=> String(h||'').toLowerCase());
  for (let i=0;i<hs.length;i++){
    const h = hs[i];
    if (keys.some(k=> h.includes(k))) return i;
  }
  return -1;
}
function guessSizeColIndex(headers=[]){
  const hs = headers.map(h=> String(h||'').toLowerCase());
  const keys = ['размер','size','eu','us','ru','cn','intl'];
  for (let i=0;i<hs.length;i++){
    if (keys.some(k=> hs[i].includes(k))) return i;
  }
  return 0;
}
function takeNumber(cell){
  if (cell==null) return null;
  const s = String(cell).replace(',', '.').trim();
  const m = s.match(/(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : null;
}
function closestOfCell(cell, target){
  if (!cell) return NaN;
  const s = String(cell).replace(',', '.');
  const nums = s.match(/\d+(?:\.\d+)?/g)?.map(Number) || [];
  if (!nums.length) return NaN;
  if (nums.length===1) return nums[0];
  const lo = Math.min(nums[0], nums[1]);
  const hi = Math.max(nums[0], nums[1]);
  if (target < lo) return lo;
  if (target > hi) return hi;
  return target;
}
