// src/components/Product.js
import { state, isFav, toggleFav, getUID } from '../core/state.js';
import { priceFmt, colorToHex } from '../core/utils.js';
import { addToCart, removeLineFromCart, isInCart } from './cartActions.js';

/* ====== КОНСТАНТЫ КЭШБЕКА/РЕФЕРАЛОВ (должны совпадать с корзиной/аккаунтом) ====== */
const CASHBACK_RATE_BASE  = 0.05; // 5%
const CASHBACK_RATE_BOOST = 0.10; // 10% для 1-го заказа по реф-ссылке

/* ——— хранилище пер-пользовательских данных ——— */
function k(base){
  try{ const uid = getUID?.() || 'guest'; return `${base}__${uid}`; }
  catch{ return `${base}__guest`; }
}

/* Может ли пользователь получить буст x2 на 1-й заказ (если пришёл по реф-ссылке и ещё не оформлял) */
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

export function renderProduct({id}){
  const p = state.products.find(x=> String(x.id)===String(id));
  if (!p){ location.hash='#/'; return; }

  const favActive = isFav(p.id);

  const images = Array.isArray(p.images) && p.images.length ? p.images : [p.images?.[0] || ''];
  const realPhotos = Array.isArray(p.realPhotos) ? p.realPhotos : [];

  // ОБЪЕДИНЁННАЯ ГАЛЕРЕЯ: сначала офф. фото, затем реальные
  const gallery = [
    ...images.map(src => ({ src, isReal:false })),
    ...realPhotos.map(src => ({ src, isReal:true })),
  ];
  const first = gallery[0] || { src:'', isReal:false };

  // Подбор «Похожие» по той же подкатегории
  const related = state.products
    .filter(x => x.categoryId === p.categoryId && String(x.id) !== String(p.id))
    .slice(0, 12);

  const v=document.getElementById('view');
  v.innerHTML = `
    <style>
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

      /* ===== Бейдж «Реальное фото товара» (main) ===== */
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
      /* Мини-бейдж на миниатюрах */
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
.p-options{
  display:grid;
  grid-template-columns:1fr;
  gap:16px;
  margin:14px 0;
}
.opt-title{ font-weight:800; margin:6px 0 8px; }
.sizes,.colors{ display:flex; flex-wrap:wrap; gap:10px; }

/* — Цвета — */
.sw{
  position:relative;
  width:38px; height:38px;
  border-radius:999px;
  border:2px solid rgba(15,23,42,.18);
  box-shadow: inset 0 0 0 2px rgba(255,255,255,.7);
  outline:none; cursor:pointer;
  transition:transform .12s ease, box-shadow .12s ease, border-color .12s ease, outline-color .12s ease;
}
@media (prefers-color-scheme:dark){
  .sw{
    border-color: rgba(255,255,255,.22);
    box-shadow: inset 0 0 0 2px rgba(0,0,0,.55);
  }
}
.sw:focus-visible{ outline:3px solid #0ea5e9; outline-offset:2px; }
.sw:hover{ transform:translateY(-1px); }

/* Активный цвет — только усиленная обводка + лёгкая анимация */
@keyframes swPulse { from{ transform:scale(1.04); } to{ transform:scale(1); } }
.sw.active{
  border-color:#0ea5e9 !important;
  box-shadow:
    inset 0 0 0 2px rgba(255,255,255,.85),
    0 0 0 3px rgba(14,165,233,.28);
  animation: swPulse .25s ease;
}

/* — Размеры — */
.size{
  padding:10px 14px;
  border:1px solid var(--stroke);
  border-radius:999px;
  background:#fff;
  font-weight:700;
  cursor:pointer;
}
.size:focus-visible{ outline:2px solid #121111; outline-offset:3px; }
.size.active{
  background:#121111;
  color:#fff;
  border-color:#121111;
}




    </style>

    <!-- Фикс-хедер карточки -->
    <div id="productFixHdr" class="product-fixhdr" aria-hidden="true">
      <button id="btnFixBack" class="fixbtn" aria-label="Назад"><i data-lucide="arrow-left"></i></button>
      <div class="fix-title">
        <div class="fix-title__name">${escapeHtml(p.title)}</div>
        <div class="fix-title__price">${priceFmt(p.price)}</div>
      </div>
      <button id="btnFixFav" class="fixbtn ${favActive?'active':''}" aria-pressed="${favActive?'true':'false'}" aria-label="В избранное"><i data-lucide="heart"></i></button>
    </div>

    <div class="product">
      <!-- ГАЛЕРЕЯ -->
      <div class="p-hero">
        <div class="gallery" role="region" aria-label="Галерея товара">
          <div class="gallery-main">
            ${first.isReal ? `<span class="real-badge"><i data-lucide="camera"></i><span>Реальное фото товара</span></span>` : ``}
            <img id="mainImg" class="zoomable" src="${first.src||''}" alt="${escapeHtml(p.title)}${first.isReal?' (реальное фото)':''}">
            <button class="hero-btn hero-back" id="goBack" aria-label="Назад"><i data-lucide="chevron-left"></i></button>
            <button class="hero-btn hero-fav ${favActive?'active':''}" id="favBtn" aria-pressed="${favActive?'true':'false'}" aria-label="В избранное"><i data-lucide="heart"></i></button>
          </div>

          ${gallery.length>1 ? `
          <div class="thumbs" id="thumbs" role="tablist" aria-label="Миниатюры">
            ${gallery.map((it, i)=>`
              <button class="thumb ${i===0?'active':''}" role="tab" aria-selected="${i===0?'true':'false'}" data-index="${i}" aria-controls="mainImg" style="position:relative">
                ${it.isReal ? `<span class="real-dot">LIVE</span>` : ``}
                <img loading="lazy" src="${it.src}" alt="Фото ${i+1}${it.isReal?' (реальное)':''}">
              </button>
            `).join('')}
          </div>` : '' }
        </div>
      </div>

      <div class="p-body home-bottom-pad">
        <div class="p-title">${escapeHtml(p.title)}</div>

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

        <!-- Характеристики -->
        <div class="specs"><b>Категория:</b> ${escapeHtml(findCategoryBySlug(p.categoryId)?.name || '—')}</div>
        <div class="specs"><b>Материал:</b> ${p.material ? escapeHtml(p.material) : '—'}</div>

        <!-- Опции -->
        <div class="p-options">
          ${(p.sizes?.length||0) ? `
          <div>
            <div class="opt-title">Размер</div>
            <div class="sizes" id="sizes">${p.sizes.map(s=>`<button class="size" data-v="${s}">${s}</button>`).join('')}</div>
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

  // help modal
  document.getElementById('cbHelpBtn')?.addEventListener('click', showCashbackHelpModal);

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

  // Навигация назад
  document.getElementById('goBack').onclick=()=> history.back();

  // Избранное
  const favBtn = document.getElementById('favBtn');
  favBtn.onclick = ()=>{
    toggleFav(p.id);
    const active = isFav(p.id);
    favBtn.classList.toggle('active', active);
    favBtn.setAttribute('aria-pressed', String(active));
    setFixFavActive(active);
  };

  // Галерея: миниатюры -> главное фото (учитываем реальные)
  const thumbs = document.getElementById('thumbs');
  const mainImg = document.getElementById('mainImg');
  const galleryMain = document.querySelector('.gallery-main');
  if (thumbs && mainImg && gallery.length){
    thumbs.addEventListener('click', (e)=>{
      const t = e.target.closest('button.thumb'); if (!t) return;
      const idx = Number(t.getAttribute('data-index'))||0;
      const it = gallery[idx] || gallery[0];
      // переключаем картинку
      mainImg.src = it.src || '';
      mainImg.alt = `${p.title}${it.isReal ? ' (реальное фото)' : ''}`;
      // бейдж
      const old = galleryMain.querySelector('.real-badge');
      if (old) old.remove();
      if (it.isReal){
        const b = document.createElement('span');
        b.className='real-badge';
        b.innerHTML = '<i data-lucide="camera"></i><span>Реальное фото товара</span>';
        galleryMain.appendChild(b);
        window.lucide?.createIcons && lucide.createIcons();
      }
      // активная миниатюра
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

  /* -------- Два хедера -------- */
  setupTwoHeaders({ isFav: favActive });
  function setupTwoHeaders({ isFav: favAtStart }){
    const stat = document.querySelector('.app-header');
    const fix  = document.getElementById('productFixHdr');
    const btnBack = document.getElementById('btnFixBack');
    const btnFav  = document.getElementById('btnFixFav');
    if (!stat || !fix || !btnBack || !btnFav) return;

    if (window._productHdrAbort){
      try{ window._productHdrAbort.abort(); }catch{}
    }
    const ctrl = new AbortController();
    window._productHdrAbort = ctrl;

    stat.classList.remove('hidden');
    fix.classList.remove('show');
    fix.setAttribute('aria-hidden','true');

    btnBack.addEventListener('click', ()=> history.back(), { signal: ctrl.signal });
    setFixFavActive(favAtStart);
    btnFav.addEventListener('click', ()=>{
      toggleFav(p.id);
      const active = isFav(p.id);
      setFixFavActive(active);
      const heroActive = favBtn.classList.contains('active');
      if (heroActive !== active){
        favBtn.classList.toggle('active', active);
        favBtn.setAttribute('aria-pressed', String(active));
      }
    }, { signal: ctrl.signal });

    const THRESHOLD = 24;
    const onScroll = ()=>{
      const sc = window.scrollY || document.documentElement.scrollTop || 0;
      const showFix = sc > THRESHOLD;
      stat.classList.toggle('hidden', showFix);
      fix.classList.toggle('show', showFix);
      fix.setAttribute('aria-hidden', String(!showFix));
    };
    window.addEventListener('scroll', onScroll, { passive:true, signal: ctrl.signal });
    onScroll();

    const cleanup = ()=>{
      fix.classList.remove('show'); fix.setAttribute('aria-hidden','true');
      stat.classList.remove('hidden');
      try{ ctrl.abort(); }catch{}
      if (window._productHdrAbort === ctrl) window._productHdrAbort = null;
    };
    window.addEventListener('hashchange', cleanup, { signal: ctrl.signal });
    window.addEventListener('popstate',  cleanup, { signal: ctrl.signal });
    window.addEventListener('beforeunload', cleanup, { signal: ctrl.signal });
  }

  function setFixFavActive(active){
    const btnFav  = document.getElementById('btnFixFav');
    if (!btnFav) return;
    btnFav.classList.toggle('active', !!active);
    btnFav.setAttribute('aria-pressed', String(!!active));
  }

  if (related.length){
    drawRelatedCards(related);
  }
}

/* карточки «Похожие» — используем шаблон #product-card (как в каталоге) */
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
      if (im){ im.src = p.images?.[0] || ''; im.alt = p.title; }

      const titleEl = node.querySelector('.title');
      if (titleEl) titleEl.textContent = p.title;

      const subEl = node.querySelector('.subtitle');
      if (subEl) {
        const labelById = categoryNameBySlug(p.categoryId) || '';
        subEl.textContent = p.categoryLabel || labelById;
      }

      const priceEl = node.querySelector('.price');
      if (priceEl) priceEl.textContent = priceFmt(p.price);

      const favBtn = node.querySelector('.fav');
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
        <img src="${p.images?.[0]||''}" alt="${escapeHtml(p.title)}">
        <div class="title">${escapeHtml(p.title)}</div>
        <div class="price">${priceFmt(p.price)}</div>
      `;
      frag.appendChild(a);
    }
  }

  grid.appendChild(frag);
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
