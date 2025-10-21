// src/components/Product.js
import { state, isFav, toggleFav } from '../core/state.js';
import { priceFmt, colorToHex } from '../core/utils.js';
import { addToCart, removeLineFromCart, isInCart } from './cartActions.js';
import { getUID } from '../core/state.js';

/* ====== КОНСТАНТЫ КЭШБЕКА/РЕФЕРАЛОВ (должны совпадать с корзиной/аккаунтом) ====== */
const CASHBACK_RATE_BASE  = 0.05; // 5%
const CASHBACK_RATE_BOOST = 0.10; // 10% для 1-го заказа по реф-ссылке

/* ——— хранилище пер-пользовательских данных ——— */
function k(base){ try{ const uid = getUID?.() || 'guest'; return `${base}__${uid}`; }catch{ return `${base}__guest`; } }

/* Может ли пользователь получить буст x2 на 1-й заказ (если пришёл по реф-ссылке и ещё не оформлял) */
function hasFirstOrderBoost(){
  try{
    const ref = JSON.parse(localStorage.getItem(k('ref_profile')) || '{}');
    const firstDone = !!ref.firstOrderDone;
    const boost = !!ref.firstOrderBoost; // устанавливается при захвате реф-ссылки
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

export function renderProduct({id}){
  const p = state.products.find(x=> String(x.id)===String(id));
  if (!p){ location.hash='#/'; return; }

  const favActive = isFav(p.id);

  const images = Array.isArray(p.images) && p.images.length ? p.images : [p.images?.[0] || ''];
  const realPhotos = Array.isArray(p.realPhotos) ? p.realPhotos : [];

  const v=document.getElementById('view');
  v.innerHTML = `
    <!-- Локальные стили (бейдж кэшбека и мини-таббар доставки) -->
    <style>
      /* ===== Кэшбек-бейдж ===== */
      .p-cashback{
        display:flex; align-items:center; gap:10px;
        margin:8px 0; padding:12px 14px;
        border-radius:14px;
        background: linear-gradient(135deg, #f59e0b 0%, #ef4444 100%);
        color:#fff;
        max-width:100%;
      }
      .p-cashback i[data-lucide="coins"]{
        flex:0 0 auto; width:20px; height:20px; opacity:.95;
      }
      .p-cb-line{
        display:flex; align-items:center; gap:8px;
        white-space:nowrap;
        overflow:visible;
        font-weight:800;
        font-size: clamp(12px, 3.6vw, 16px);
        line-height:1.2;
      }
      .p-cb-pts{ font-variant-numeric: tabular-nums; }
      .p-cb-x2{
        flex:0 0 auto;
        font-size:.78em; line-height:1;
        padding:3px 7px; border-radius:999px;
        background:rgba(255,255,255,.18);
        border:1px solid rgba(255,255,255,.28);
        font-weight:800;
      }
      .p-cb-help{
        margin-left:auto;
        display:inline-flex; align-items:center; justify-content:center;
        width:28px; height:28px; border-radius:999px;
        background:rgba(255,255,255,.14); border:1px solid rgba(255,255,255,.28);
        transition:filter .15s ease;
      }
      /* Lucide заменяет <i> на <svg>, красим именно svg-иконку (белая) */
      .p-cb-help svg{ width:16px; height:16px; stroke:#fff; }
      @media (hover:hover){
        .p-cb-help:hover{ filter:brightness(1.05); }
      }

      /* ===== Мини-таббар доставки (над основным таббаром) ===== */
      .mini-tabbar{
        position:fixed;
        left:0; right:0;
        bottom:0;
        z-index:1001;
        display:flex; align-items:center;
        padding:8px 12px;

        /* glassmorphism */
        background: linear-gradient(180deg, rgba(255,255,255,.28), rgba(255,255,255,.18));
        -webkit-backdrop-filter: saturate(160%) blur(12px);
        backdrop-filter: saturate(160%) blur(12px);
        border:1px solid rgba(255,255,255,.35);
        border-radius:12px;
        box-shadow: 0 10px 30px rgba(0,0,0,.12), 0 -2px 10px rgba(0,0,0,.08) inset;

        color:#0f172a;
        pointer-events:auto;
      }
      .mini-tabbar__inner{
        display:flex; align-items:center; gap:8px; width:100%;
        font-size:14px; font-weight:800;
      }
      .mini-tabbar__inner i{ width:18px; height:18px; }
      .mini-tabbar__inner svg{ stroke:#0f172a; opacity:.9; }
      .mini-tabbar .muted{ font-weight:700; opacity:.85; }
      @media (max-width:420px){
        .mini-tabbar__inner{ font-size:13px; }
      }
      @media (prefers-color-scheme: dark){
        .mini-tabbar{
          background: linear-gradient(180deg, rgba(15,23,42,.65), rgba(15,23,42,.45));
          border-color: rgba(255,255,255,.18);
          color:#fff;
        }
        .mini-tabbar__inner svg{ stroke:#fff; }
        .mini-tabbar .muted{ opacity:.95; }
      }
    </style>

    <!-- Фикс-хедер карточки (показывается при прокрутке) -->
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
            <img id="mainImg" class="zoomable" src="${images[0]||''}" alt="${escapeHtml(p.title)}">
            <button class="hero-btn hero-back" id="goBack" aria-label="Назад"><i data-lucide="chevron-left"></i></button>
            <button class="hero-btn hero-fav ${favActive?'active':''}" id="favBtn" aria-pressed="${favActive?'true':'false'}" aria-label="В избранное"><i data-lucide="heart"></i></button>
          </div>

          ${images.length>1 ? `
          <div class="thumbs" id="thumbs" role="tablist" aria-label="Миниатюры">
            ${images.map((src, i)=>`
              <button class="thumb ${i===0?'active':''}" role="tab" aria-selected="${i===0?'true':'false'}" data-index="${i}" aria-controls="mainImg">
                <img loading="lazy" src="${src}" alt="Фото ${i+1}">
              </button>
            `).join('')}
          </div>` : '' }
        </div>
      </div>

      <div class="p-body home-bottom-pad">
        <div class="p-title">${escapeHtml(p.title)}</div>

        <!-- Кэшбек-виджет -->
        <div class="p-cashback" role="note" aria-label="Информация о кэшбеке">
          <i data-lucide="coins" aria-hidden="true"></i>
          ${cashbackSnippetHTML(p.price)}
          <button id="cbHelpBtn" class="p-cb-help" type="button" aria-label="Как работает кэшбек?">
            <i data-lucide="help-circle"></i>
          </button>
        </div>

        <!-- Блок «Срок доставки» убран из карточки. Теперь он показывается мини-таббаром над CTA. -->

        <!-- СТАРЫЕ СТРОКИ ХАРАКТЕРИСТИК -->
        <div class="specs"><b>Категория:</b> ${escapeHtml(findCategoryBySlug(p.categoryId)?.name || '—')}</div>
        <div class="specs"><b>Материал:</b> ${p.material ? escapeHtml(p.material) : '—'}</div>

        <!-- СТАРЫЕ ОПЦИИ (РАЗМЕР/ЦВЕТ) -->
        <div class="p-options">
          ${(p.sizes?.length||0) ? `
          <div>
            <div class="opt-title">Размер</div>
            <div class="sizes" id="sizes">${p.sizes.map(s=>`<button class="size" data-v="${s}">${s}</button>`).join('')}</div>
          </div>`:''}
          <div>
            <div class="opt-title">Цвет</div>
            <div class="colors" id="colors">${(p.colors||[]).map(c=>`<button class="sw" title="${c}" data-v="${c}" style="background:${colorToHex(c)}"></button>`).join('')}</div>
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

        ${realPhotos.length ? `
        <div class="opt-title" style="margin-top:14px">Реальные фото</div>
        <div class="real-photos">
          ${realPhotos.map((src,i)=>`
            <div class="real-photo">
              <img loading="lazy" class="zoomable" src="${src}" alt="Реальное фото ${i+1}">
            </div>
          `).join('')}
        </div>` : ''}

      </div>
    </div>`;

  window.lucide?.createIcons && lucide.createIcons();

  // help modal (кнопка с вопросом)
  document.getElementById('cbHelpBtn')?.addEventListener('click', showCashbackHelpModal);

  // Требуется ли выбор размера
  const needSize = Array.isArray(p.sizes) && p.sizes.length>0;

  // выбранные опции (без количества)
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
      colors.querySelectorAll('.sw').forEach(x=>x.classList.remove('active'));
      b.classList.add('active'); color=b.getAttribute('data-v');
      refreshCTAByState();
    });
    colors.querySelector('.sw')?.classList.add('active');
  }

  // Навигация назад (кнопка на герое)
  document.getElementById('goBack').onclick=()=> history.back();

  // Избранное (кнопка на герое)
  const favBtn = document.getElementById('favBtn');
  favBtn.onclick = ()=>{
    toggleFav(p.id);
    const active = isFav(p.id);
    favBtn.classList.toggle('active', active);
    favBtn.setAttribute('aria-pressed', String(active));
    setFixFavActive(active);
  };

  // Галерея: миниатюры -> главное фото
  const thumbs = document.getElementById('thumbs');
  const mainImg = document.getElementById('mainImg');
  if (thumbs && mainImg){
    thumbs.addEventListener('click', (e)=>{
      const t = e.target.closest('button.thumb'); if (!t) return;
      const idx = Number(t.getAttribute('data-index'))||0;
      mainImg.src = images[idx] || images[0] || '';
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

    // показать мини-таббар доставки поверх основного CTA
    try{ showDeliveryMiniBar(); }catch{}
  }

  function showInCartCTAs(){
    window.setTabbarCTAs?.(
      {
        html:`<i data-lucide="x"></i><span>Убрать из корзины</span>`,
        onClick(){ removeLineFromCart(p.id, size||null, color||null); showAddCTA(); }
      },
      {
        html:`<i data-lucide="shopping-bag"></i><span>Перейти в корзину</span>`,
        onClick(){ location.hash = '#/cart'; }
      }
    );
    try{ showDeliveryMiniBar(); }catch{}
  }

  function refreshCTAByState(){
    if (needSize && !size){ showAddCTA(); return; }
    if (isInCart(p.id, size||null, color||null)) showInCartCTAs(); else showAddCTA();
  }
  refreshCTAByState();

  /* -------- Мини-таббар «Срок доставки» -------- */
  function showDeliveryMiniBar(){
    ensureMiniTabbar();
    updateMiniTabbarPosition();
    const inner = document.getElementById('miniTabbarInner');
    if (inner){
      inner.innerHTML = `
        <i data-lucide="clock"></i>
        <span>Срок доставки:</span>
        <span class="muted"><b>14–16 дней</b></span>
      `;
      window.lucide?.createIcons && lucide.createIcons();
    }
  }

  function ensureMiniTabbar(){
    if (document.getElementById('miniTabbar')) return;
    const bar = document.createElement('div');
    bar.id = 'miniTabbar';
    bar.className = 'mini-tabbar';
    bar.innerHTML = `<div id="miniTabbarInner" class="mini-tabbar__inner"></div>`;
    document.body.appendChild(bar);

    const onResize = ()=> { try{ updateMiniTabbarPosition(); }catch{} };
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onResize, { passive:true });

    const cleanup = ()=>{
      try{ bar.remove(); }catch{}
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onResize);
      window.removeEventListener('hashchange', cleanup);
      window.removeEventListener('popstate', cleanup);
      window.removeEventListener('beforeunload', cleanup);
    };
    window.addEventListener('hashchange', cleanup);
    window.addEventListener('popstate', cleanup);
    window.addEventListener('beforeunload', cleanup);
  }

  function getTabbarEl(){
    return document.querySelector('.tabbar')
        || document.querySelector('.app-tabbar')
        || document.getElementById('tabbar');
  }
  function getTabbarHeight(){
    const tb = getTabbarEl();
    return tb ? Math.ceil(tb.getBoundingClientRect().height) : 64;
  }

  function updateMiniTabbarPosition(){
    const bar = document.getElementById('miniTabbar');
    if (!bar) return;

    // отступ сверху от основного таббара
    const bottomOffset = getTabbarHeight();
    bar.style.bottom = `${bottomOffset}px`;

    // подгоняем ширину и положение под реальный прямоугольник основного таббара
    const tb = getTabbarEl();
    const vw = window.innerWidth || document.documentElement.clientWidth || 360;

    let left = 8;
    let width = vw - 16;

    if (tb){
      const rect = tb.getBoundingClientRect();
      const inset = rect.width >= 420 ? 12 : 8;

      left = Math.max(8, rect.left + inset);
      width = Math.max(140, Math.min(vw - left - inset, rect.width - inset * 2));
    }

    bar.style.left = `${left}px`;
    bar.style.right = `auto`;
    bar.style.width = `${width}px`;
  }

  /* -------- Зум/панорамирование -------- */
  ensureZoomOverlay();
  initZoomableInPlace(mainImg);
  document.querySelectorAll('.real-photos img.zoomable').forEach(initZoomableInPlace);
  document.querySelectorAll('img.zoomable').forEach(img=>{
    img.addEventListener('click', ()=> openZoomOverlay(img.src));
  });
  function resetZoom(){ if (!mainImg) return; mainImg.style.transform=''; mainImg.dataset.zoom='1'; }

  /* -------- ДВА РАЗНЫХ ХЕДЕРА: показ/скрытие -------- */
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
}

/* ===== Короткий бейдж: «Кэшбек + N баллов» ===== */
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
