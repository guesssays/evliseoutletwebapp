import { state } from '../core/state.js';
import { priceFmt, colorToHex } from '../core/utils.js';
import { addToCart, removeLineFromCart, isInCart } from './cartActions.js';

export function renderProduct({id}){
  const p = state.products.find(x=> String(x.id)===String(id));
  if (!p){ location.hash='#/'; return; }

  const favSet = new Set(JSON.parse(localStorage.getItem('nas_fav')||'[]'));
  const isFav = favSet.has(p.id);

  const images = Array.isArray(p.images) && p.images.length ? p.images : [p.images?.[0] || ''];
  const realPhotos = Array.isArray(p.realPhotos) ? p.realPhotos : [];

  const v=document.getElementById('view');
  v.innerHTML = `
    <div class="product">
      <!-- ГАЛЕРЕЯ -->
      <div class="p-hero">
        <div class="gallery" role="region" aria-label="Галерея товара">
          <div class="gallery-main">
            <img id="mainImg" class="zoomable" src="${images[0]||''}" alt="${escapeHtml(p.title)}">
            <button class="hero-btn hero-back" id="goBack" aria-label="Назад"><i data-lucide="chevron-left"></i></button>
            <button class="hero-btn hero-fav ${isFav?'active':''}" id="favBtn" aria-pressed="${isFav?'true':'false'}" aria-label="В избранное"><i data-lucide="heart"></i></button>
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

      <div class="p-body">
        <div class="qty-row" style="justify-content:flex-end">
          <div class="qty-ctrl">
            <button class="ctrl" id="dec" aria-label="Уменьшить"><i data-lucide="minus"></i></button>
            <span id="qty">1</span>
            <button class="ctrl" id="inc" aria-label="Увеличить"><i data-lucide="plus"></i></button>
          </div>
        </div>

        <div class="p-title">${escapeHtml(p.title)}</div>
        <div class="p-desc">${p.description ? escapeHtml(p.description) : 'Описание скоро будет обновлено.'}</div>
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

  // qty + опции
  let qty=1, size=null, color=(p.colors||[])[0]||null;
  const qtyEl=document.getElementById('qty');
  document.getElementById('inc').onclick = ()=>{ qty++; qtyEl.textContent=qty; };
  document.getElementById('dec').onclick = ()=>{ qty=Math.max(1,qty-1); qtyEl.textContent=qty; };
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

  // Навигация назад
  document.getElementById('goBack').onclick=()=> history.back();

  // Избранное
  const favBtn = document.getElementById('favBtn');
  favBtn.onclick = ()=>{
    let list = JSON.parse(localStorage.getItem('nas_fav')||'[]');
    const i = list.indexOf(p.id);
    const nowFav = i===-1;
    if (nowFav) list.push(p.id); else list.splice(i,1);
    localStorage.setItem('nas_fav', JSON.stringify(list));
    favBtn.classList.toggle('active', nowFav);
    favBtn.setAttribute('aria-pressed', String(nowFav));
  };

  // Галерея: миниатюры -> главное фото
  const thumbs = document.getElementById('thumbs');
  const mainImg = document.getElementById('mainImg');
  if (thumbs && mainImg){
    thumbs.addEventListener('click', (e)=>{
      const t = e.target.closest('.thumb'); if (!t) return;
      const idx = Number(t.getAttribute('data-index'))||0;
      mainImg.src = images[idx] || images[0] || '';
      thumbs.querySelectorAll('.thumb').forEach(x=>{
        x.classList.toggle('active', x===t);
        x.setAttribute('aria-selected', x===t ? 'true':'false');
      });
      resetZoom(); // сбросить зум при смене фото
    });

    // keyboard навигация
    thumbs.addEventListener('keydown', (e)=>{
      const all = Array.from(thumbs.querySelectorAll('.thumb'));
      const curr = all.findIndex(x=> x.classList.contains('active'));
      if (e.key==='ArrowRight' || e.key==='ArrowDown'){
        const n = all[Math.min(all.length-1, curr+1)];
        n?.focus(); n?.click(); e.preventDefault();
      }else if (e.key==='ArrowLeft' || e.key==='ArrowUp'){
        const pbtn = all[Math.max(0, curr-1)];
        pbtn?.focus(); pbtn?.click(); e.preventDefault();
      }
    });
  }

  /* -------- ДИНАМИЧЕСКИЙ CTA в таббаре -------- */
  function showAddCTA(){
    window.setTabbarCTA({
      html: `<i data-lucide="shopping-bag"></i><span>Добавить в корзину&nbsp;|&nbsp;${priceFmt(p.price)}</span>`,
      onClick(){
        addToCart(p, size, color, qty);
        showInCartCTAs();
      }
    });
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
    if (isInCart(p.id, size||null, color||null)) showInCartCTAs(); else showAddCTA();
  }
  // первичное включение CTA
  refreshCTAByState();

  /* -------- ЗУМ/ПАНОРАМИРОВАНИЕ -------- */
  ensureZoomOverlay();                  // разово — создаём оверлей контейнер
  initZoomableInPlace(mainImg);         // даём зум по двойному тапу/колёсику прямо в карточке
  document.querySelectorAll('.real-photos img.zoomable').forEach(initZoomableInPlace);

  // кликом — открыть fullscreen overlay для детального просмотра
  document.querySelectorAll('img.zoomable').forEach(img=>{
    img.addEventListener('click', ()=> openZoomOverlay(img.src));
  });

  function resetZoom(){
    if (!mainImg) return;
    mainImg.style.transform = '';
    mainImg.dataset.zoom = '1';
  }
}

/* утилита экранирования */
function escapeHtml(s=''){
  return s.replace(/[&<>"']/g, m=> ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

/* ===== ЗУМ ВНУТРИ БЛОКА (без фуллскрина) ===== */
function initZoomableInPlace(img){
  if (!img) return;
  let scale = 1, originX = 0, originY = 0, startDist = 0, startScale = 1, dragging=false, lastX=0, lastY=0, tx=0, ty=0, lastTap=0;

  // колесо мыши
  img.addEventListener('wheel', (e)=>{
    e.preventDefault();
    const rect = img.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const delta = -Math.sign(e.deltaY) * 0.2;
    zoomAt(mx, my, delta);
  }, {passive:false});

  // двойной тап/клик
  img.addEventListener('click', (e)=>{
    const now = Date.now();
    if (now - lastTap < 300){
      const rect = img.getBoundingClientRect();
      zoomAt(e.clientX - rect.left, e.clientY - rect.top, scale>1 ? -999 : 1.5);
      e.preventDefault();
    }
    lastTap = now;
  });

  // панорамирование (мышь)
  img.addEventListener('mousedown', (e)=>{ if (scale<=1) return;
    dragging=true; lastX=e.clientX; lastY=e.clientY; e.preventDefault();
  });
  window.addEventListener('mousemove', (e)=>{ if(!dragging) return;
    const dx=e.clientX-lastX, dy=e.clientY-lastY; lastX=e.clientX; lastY=e.clientY; tx+=dx; ty+=dy; apply();
  });
  window.addEventListener('mouseup', ()=> dragging=false);

  // touch: pinch + pan
  img.addEventListener('touchstart', (e)=>{
    if (e.touches.length===2){
      startDist = dist(e.touches[0], e.touches[1]);
      startScale = scale;
      const rect = img.getBoundingClientRect();
      originX = ((e.touches[0].clientX + e.touches[1].clientX)/2) - rect.left;
      originY = ((e.touches[0].clientY + e.touches[1].clientY)/2) - rect.top;
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
    // сдвигаем так, чтобы точка зума оставалась под пальцем
    tx -= (x - (x - tx)) * (scale/old - 1);
    ty -= (y - (y - ty)) * (scale/old - 1);
    apply();
  }
  function apply(){
    // легкие ограничители, чтобы не «улетало» далеко
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

  // жесты для оверлея — независимые
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
