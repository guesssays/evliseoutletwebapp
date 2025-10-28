// src/components/ProductFixHeader.js
// Фикс-хедер карточки товара: стабильные клики, безопасный «Назад», синхронизированное сердце
// Экспорт: activateProductFixHeader, deactivateProductFixHeader, setFavActive

let S = {
  // DOM
  root: null,
  statHeader: null,

  // API от Product.js
  onBack: null,          // () => void
  onFavToggle: null,     // () => void
  isFav: null,           // () => boolean (для текущего товара)

  // состояние
  shown: false,
  threshold: 24,
  listenersBound: false,

  // служебное
  _scrollTargets: [],
  _unbindDetectors: [],
  _onFavChanged: null,

  // стабильные ссылки на обработчики
  _handlers: {
    onScroll: null,
    onPointerUp: null,
    onClick: null, // fallback на случай отсутствия pointer-событий
  },

  // защита от дребезга/дублирования (между pointerup и click)
  _tsBack: 0,
  _tsFav: 0,
  _cooldownMs: 180,
  _lastActionStamp: 0,

  // наблюдатель за DOM внутри фикс-хедера (если фреймворк перерисовывает)
  _observer: null,
};

function $(id){ return document.getElementById(id); }

/* ===================== универсальный поиск скролл-контейнера ===================== */
function classicCandidates(){
  const arr = [];
  if (document.scrollingElement) arr.push(document.scrollingElement);
  const view = $('view'); if (view) arr.push(view);
  const app  = $('app');  if (app) arr.push(app);
  arr.push(window);
  return arr;
}
let __activeScrollTarget = null;
function findAnyScrollable(){
  const all = Array.from(document.querySelectorAll('body, body *'));
  for (const el of all){
    try{
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none') continue;
      const oy = cs.overflowY;
      if ((oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight) return el;
    }catch{}
  }
  return null;
}
function getScrollTargets(){
  const out = new Set();
  if (__activeScrollTarget) out.add(__activeScrollTarget);
  for (const c of classicCandidates()) out.add(c);
  const auto = findAnyScrollable();
  if (auto) out.add(auto);
  return Array.from(out);
}
function bindActiveTargetDetector(node){
  const onWheel = (e)=>{ __activeScrollTarget = e.currentTarget; };
  const onTouch = (e)=>{ __activeScrollTarget = e.currentTarget; };
  node.addEventListener('wheel', onWheel, { passive:true });
  node.addEventListener('touchmove', onTouch, { passive:true });
  return ()=> {
    node.removeEventListener('wheel', onWheel);
    node.removeEventListener('touchmove', onTouch);
  };
}
function getScrollY(){
  if (__activeScrollTarget && __activeScrollTarget !== window){
    return __activeScrollTarget.scrollTop || 0;
  }
  for (const c of getScrollTargets()){
    if (c === window){
      const y = window.scrollY || document.documentElement.scrollTop || 0;
      if (y) return y;
    } else if (c && c.scrollHeight > c.clientHeight){
      const y = c.scrollTop || 0;
      if (y) return y;
    }
  }
  return 0;
}
/* ============================================================================== */

function a11yShow(el){
  if (!el) return;
  el.classList.add('show');
  el.removeAttribute('aria-hidden');
  el.removeAttribute('inert');
}
function a11yHide(el){
  if (!el) return;
  try { if (el.contains(document.activeElement)) document.activeElement.blur(); } catch {}
  el.classList.remove('show');
  requestAnimationFrame(()=>{ requestAnimationFrame(()=>{
    el.setAttribute('aria-hidden', 'true');
    el.setAttribute('inert', '');
  });});
}

function showFixHeader(){
  if (S.shown) return;
  S.shown = true;
  a11yShow(S.root);
  if (S.statHeader){
    S.statHeader.classList.add('hidden');
    S.statHeader.setAttribute('aria-hidden','true');
    S.statHeader.setAttribute('inert','');
  }
}
function hideFixHeader(){
  if (!S.shown) return;
  S.shown = false;
  a11yHide(S.root);
  if (S.statHeader){
    S.statHeader.classList.remove('hidden');
    S.statHeader.removeAttribute('aria-hidden');
    S.statHeader.removeAttribute('inert');
  }
}
function onScrollCheck(){
  const y = getScrollY();
  if (y > S.threshold) showFixHeader();
  else hideFixHeader();
}

/* ---------------- безопасный «Назад» ---------------- */
function safeBack(){
  const now = Date.now();
  if (now - S._tsBack < S._cooldownMs) return;
  S._tsBack = now;

  try{
    if (history.length <= 1){
      const h = String(location.hash||'');
      if (!h || h.startsWith('#/product/')) {
        location.hash = '#/';
        return;
      }
    }
    history.back();
  }catch{
    location.hash = '#/';
  }
}

/* ---------------- сердце ---------------- */
function doFavToggle(){
  const now = Date.now();
  if (now - S._tsFav < S._cooldownMs) return;
  S._tsFav = now;

  try { S.onFavToggle && S.onFavToggle(); } catch {}
  try {
    const on = !!(S.isFav && S.isFav());
    setFavActive(on);
  } catch {}
}

/* ---------------- делегирование событий ---------------- */
// Единая точка входа, чтобы DOM-замены кнопок не ломали обработчики.
function handleActionFromTarget(target){
  const backBtn = target.closest?.('#btnFixBack');
  const favBtn  = target.closest?.('#btnFixFav');

  if (!backBtn && !favBtn) return false;

  const stamp = performance.now();
  // защита от двойного срабатывания (pointerup + click)
  if (stamp - S._lastActionStamp < 60) return true;
  S._lastActionStamp = stamp;

  if (backBtn) { safeBack(); return true; }
  if (favBtn)  { doFavToggle(); return true; }

  return false;
}

function bindListeners(){
  if (S.listenersBound) return;

  // скролл-лисенеры
  S._handlers.onScroll = onScrollCheck;
  S._scrollTargets = getScrollTargets();
  for (const t of S._scrollTargets){
    if (t === window) window.addEventListener('scroll', S._handlers.onScroll, { passive:true });
    else t.addEventListener('scroll', S._handlers.onScroll, { passive:true });
  }
  // трекер активного скролл-контейнера
  S._unbindDetectors = S._scrollTargets.map(bindActiveTargetDetector);

  // делегированные обработчики внутри фикс-хедера
  S._handlers.onPointerUp = (e)=> {
    // перехватываем как можно раньше
    if (!S.root) return;
    if (!S.root.contains(e.target)) return;
    e.preventDefault();
    e.stopPropagation();
    handleActionFromTarget(e.target);
  };
  S._handlers.onClick = (e)=> {
    // запасной канал (некоторые WebView странно ведут pointer-события)
    if (!S.root) return;
    if (!S.root.contains(e.target)) return;
    e.preventDefault();
    e.stopPropagation();
    handleActionFromTarget(e.target);
  };

  // слушаем на самом корневом узле фикс-хедера в capture-режиме,
  // чтобы нас не "перекрыли" внутренние ребилды/листенеры
  S.root.addEventListener('pointerup', S._handlers.onPointerUp, { capture:true, passive:false });
  S.root.addEventListener('click',     S._handlers.onClick,     { capture:true, passive:false });

  // глобальный синк избранного
  S._onFavChanged = ()=> {
    try {
      const on = !!(S.isFav && S.isFav());
      setFavActive(on);
    } catch {}
  };
  window.addEventListener('fav:changed', S._onFavChanged);

  // подстраховка: если фреймворк заменяет внутреннюю разметку,
  // просто следим и актуализируем ARIA/active у свежих узлов
  try {
    S._observer = new MutationObserver(() => {
      // при любом изменении — обновим подсветку сердца
      const on = !!(S.isFav && S.isFav());
      setFavActive(on);
    });
    S._observer.observe(S.root, { childList: true, subtree: true });
  } catch {}

  S.listenersBound = true;

  // мгновенный расчёт видимости
  queueMicrotask(onScrollCheck);
}

function unbindListeners(){
  if (!S.listenersBound) return;

  // скролл-лисенеры
  for (const t of S._scrollTargets){
    if (!t) continue;
    try{
      if (t === window) window.removeEventListener('scroll', S._handlers.onScroll);
      else t.removeEventListener('scroll', S._handlers.onScroll);
    }catch{}
  }
  S._scrollTargets = [];

  // отписать детекторы
  for (const unb of S._unbindDetectors){ try{ unb(); }catch{} }
  S._unbindDetectors = [];

  // делегированные обработчики
  try{ S.root?.removeEventListener('pointerup', S._handlers.onPointerUp, { capture:true }); }catch{}
  try{ S.root?.removeEventListener('click',     S._handlers.onClick,     { capture:true }); }catch{}

  // глобальное событие избранного
  try{ window.removeEventListener('fav:changed', S._onFavChanged); }catch{}

  // наблюдатель
  try{ S._observer?.disconnect(); }catch{}
  S._observer = null;

  S._handlers.onScroll = S._handlers.onPointerUp = S._handlers.onClick = null;
  S._onFavChanged = null;

  S.listenersBound = false;
}

/* ---------------- ПУБЛИЧНОЕ API ---------------- */
export function activateProductFixHeader(opts = {}){
  // DOM
  S.root = $('productFixHdr');
  S.statHeader = document.querySelector('.app-header');

  if (!S.root) return;

  // API
  S.onBack      = typeof opts.onBack === 'function' ? opts.onBack : null;
  S.onFavToggle = typeof opts.onFavToggle === 'function' ? opts.onFavToggle : null;
  S.isFav       = typeof opts.isFav === 'function' ? opts.isFav : null;

  S.threshold   = Number(opts.showThreshold || opts.threshold || 24) || 24;

  // начальная подсветка сердца
  try {
    const on = !!(S.isFav && S.isFav());
    setFavActive(on);
  } catch {}

  // убедиться, что слой кликабелен
  S.root.style.pointerEvents = 'auto';

  bindListeners();
  onScrollCheck(); // мгновенный расчёт видимости
}

export function deactivateProductFixHeader(){
  // Скрываем слой и возвращаем статичный хедер
  try{ hideFixHeader(); }catch{}
  // Снимаем слушатели
  unbindListeners();

  // Сброс API
  S.onBack = S.onFavToggle = S.isFav = null;

  // Сброс антидребезга
  S._tsBack = 0;
  S._tsFav  = 0;

  // DOM
  S.root = S.statHeader = null;
}

export function setFavActive(on){
  try{
    const favEl = document.getElementById('btnFixFav'); // всегда «живая» ссылка
    if (!favEl) return;
    const active = !!on;
    favEl.classList.toggle('active', active);
    favEl.setAttribute('aria-pressed', active ? 'true' : 'false');
  }catch{}
}
