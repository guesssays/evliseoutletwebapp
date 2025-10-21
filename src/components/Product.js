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
        <div class="p-cashback" style="display:flex;align-items:center;gap:8px;margin:6px 0 8px;padding:8px;border-radius:12px;background:var(--card,rgba(0,0,0,.04))">
          <i data-lucide="coins" aria-hidden="true"></i>
          <div>
            ${cashbackSnippetHTML(p.price)}
            <div class="muted mini">1 балл = 1 сум · Начисление через 24ч</div>
          </div>
        </div>

        <!-- ВМЕСТО ОПИСАНИЯ: СРОК ДОСТАВКИ -->
        <div class="p-delivery" style="display:flex;align-items:center;gap:8px;margin:6px 0 8px">
          <i data-lucide="clock"></i>
          <span><b>Срок доставки:</b> 14–16 дней</span>
        </div>

        <div class="specs"><b>Категория:</b> ${escapeHtml(findCategoryBySlug(p.categoryId)?.name || '—')}</div>
        <div class="specs"><b>Материал:</b> ${p.material ? escapeHtml(p.material) : '—'}</div>

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
    window.setTabbarCTA({
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
    window.setTabbarCTAs(
      {
        html:`<i data-lucide="x"></i><span>Убрать из корзины</span>`,
        onClick(){ removeLineFromCart(p.id, size||null, color||null); showAddCTA(); }
      },
      {
        html:`<i data-lucide="shopping-bag"></i><span>Перейти в корзину</span>`,
        onClick(){ location.hash = '#/cart'; }
      }
    );
  }

  function refreshCTAByState(){
    if (needSize && !size){ showAddCTA(); return; }
    if (isInCart(p.id, size||null, color||null)) showInCartCTAs(); else showAddCTA();
  }
  refreshCTAByState();

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

  /* ==== ВНУТРЕННЕЕ: управление двумя хедерами ==== */
  function setupTwoHeaders({ isFav: favAtStart }){
    const stat = document.querySelector('.app-header');           // статичный системный хедер
    const fix  = document.getElementById('productFixHdr');        // наш фикс-хедер карточки
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

/* ===== МАЛЕНЬКИЙ ВИДЖЕТ «СКОЛЬКО БАЛЛОВ» ===== */
function cashbackSnippetHTML(price){
  const boost = hasFirstOrderBoost(); // true только для реферала до первого заказа
  const rate = boost ? CASHBACK_RATE_BOOST : CASHBACK_RATE_BASE;
  const pts  = Math.floor((Number(price)||0) * rate);

  // Для нереферала — просто сумма баллов без упоминания x2.
  // Для реферала — сразу указываем x2 и что действует только на первый заказ.
  const tail = boost ? ' (x2 кэшбек — только на первый заказ)' : '';
  return `<div class="cart-title" style="font-size:15px">
    За покупку вы получите <b>${pts}</b> баллов${tail}.
  </div>`;
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
