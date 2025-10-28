// src/components/ProductFixHeader.js
// Фикс-хедер карточки товара: стабильные клики без «залипаний».
// Экспорт: activateProductFixHeader, deactivateProductFixHeader, setFavActive

import { ScrollReset } from '../core/scroll-reset.js';

const S = {
  // DOM
  root: null,
  statHeader: null,
  btnBack: null,
  btnFav: null,

  // API из Product.js
  onBack: null,          // () => void
  onFavToggle: null,     // () => void
  isFav: null,           // () => boolean

  // состояние
  shown: false,
  threshold: 24,
  listenersBound: false,

  // вспомогательное
  _scrollTargets: [],
  _unbindDetectors: [],
  _observer: null,

  // антидребезг
  _cooldownMs: 180,
  _tsBack: 0,
  _tsFav: 0,
};

const $ = (id) => document.getElementById(id);

/* ===================== определение источника скролла ===================== */
const classicCandidates = () => {
  const arr = [];
  if (document.scrollingElement) arr.push(document.scrollingElement);
  const view = $('view'); if (view) arr.push(view);
  const app  = $('app');  if (app) arr.push(app);
  arr.push(window);
  return arr;
};
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
/* ======================================================================== */

function a11yShow(el){
  if (!el) return;
  el.classList.add('show');
  el.removeAttribute('aria-hidden');
  el.removeAttribute('inert');
}
function a11yHide(el){
  if (!el) return;
  try{ if (el.contains(document.activeElement)) document.activeElement.blur(); }catch{}
  el.classList.remove('show');
  requestAnimationFrame(()=>{ requestAnimationFrame(()=>{
    el.setAttribute('aria-hidden','true');
    el.setAttribute('inert','');
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

/* ===================== обработчики кнопок (без делегирования) ===================== */
function safeBack(){
  const now = Date.now();
  if (now - S._tsBack < S._cooldownMs) return;
  S._tsBack = now;

  // подавляем возможные внешние ScrollReset.request, чтобы не тянуло вверх
  try { ScrollReset.suppress(900); } catch {}

  try{
    if (history.length <= 1){
      const h = String(location.hash||'');
      if (!h || h.startsWith('#/product/')) {
        location.hash = '#/'; return;
      }
    }
    history.back();
  }catch{
    location.hash = '#/';
  }
}

function doFavToggle(){
  const now = Date.now();
  if (now - S._tsFav < S._cooldownMs) return;
  S._tsFav = now;

  // на всякий случай — глушим автосбросы скролла коротким окном
  try { ScrollReset.suppress(700); } catch {}

  try { S.onFavToggle && S.onFavToggle(); } catch {}
  try {
    const on = !!(S.isFav && S.isFav());
    setFavActive(on);
  } catch {}
}

/** Навесить клики на конкретные кнопки. Пере-бинд при замене DOM. */
function bindButtonHandlers(){
  const back = $('btnFixBack');
  const fav  = $('btnFixFav');

  // уже навешаны?
  if (S.btnBack === back && S.btnFav === fav) return;

  // снять старые, если были
  try{ S.btnBack?.removeEventListener('click', safeBack); }catch{}
  try{ S.btnFav?.removeEventListener('click', doFavToggle); }catch{}

  S.btnBack = back;
  S.btnFav  = fav;

  if (back){
    back.style.pointerEvents = 'auto';
    back.addEventListener('click', safeBack, { passive: true });
  }
  if (fav){
    fav.style.pointerEvents = 'auto';
    fav.addEventListener('click',  doFavToggle, { passive: true });
  }
}

/* ===================== lifecycle ===================== */
function bindListeners(){
  if (S.listenersBound) return;

  // скролл
  S._scrollTargets = getScrollTargets();
  for (const t of S._scrollTargets){
    if (t === window) window.addEventListener('scroll', onScrollCheck, { passive:true });
    else t.addEventListener('scroll', onScrollCheck, { passive:true });
  }
  S._unbindDetectors = S._scrollTargets.map(bindActiveTargetDetector);

  // прямые клики по кнопкам (без делегирования и без preventDefault)
  bindButtonHandlers();

  // следим за заменой внутренней разметки (иконки/перерисовка) и ребиндим
  try{
    S._observer = new MutationObserver(bindButtonHandlers);
    S._observer.observe(S.root, { childList: true, subtree: true });
  }catch{}

  S.listenersBound = true;

  // начальный расчёт
  queueMicrotask(onScrollCheck);
  requestAnimationFrame(onScrollCheck);
  setTimeout(onScrollCheck, 60);
}

function unbindListeners(){
  if (!S.listenersBound) return;

  for (const t of S._scrollTargets){
    try{
      if (t === window) window.removeEventListener('scroll', onScrollCheck);
      else t.removeEventListener('scroll', onScrollCheck);
    }catch{}
  }
  S._scrollTargets = [];
  for (const unb of S._unbindDetectors){ try{ unb(); }catch{} }
  S._unbindDetectors = [];

  try{ S.btnBack?.removeEventListener('click', safeBack); }catch{}
  try{ S.btnFav?.removeEventListener('click', doFavToggle); }catch{}
  S.btnBack = S.btnFav = null;

  try{ S._observer?.disconnect(); }catch{}
  S._observer = null;

  S.listenersBound = false;
}

/* ===================== PUBLIC API ===================== */
export function activateProductFixHeader(opts = {}){
  S.root = $('productFixHdr');
  S.statHeader = document.querySelector('.app-header');
  if (!S.root) return;

  S.onBack      = typeof opts.onBack === 'function' ? opts.onBack : null;
  S.onFavToggle = typeof opts.onFavToggle === 'function' ? opts.onFavToggle : null;
  S.isFav       = typeof opts.isFav === 'function' ? opts.isFav : null;

  S.threshold   = Number(opts.showThreshold || opts.threshold || 24) || 24;

  // первичная подсветка сердца
  try { setFavActive(!!(S.isFav && S.isFav())); } catch {}

  // слой и кнопки кликабельны (без делегирования)
  S.root.style.pointerEvents = 'auto';

  bindListeners();
  onScrollCheck();
}

export function deactivateProductFixHeader(){
  try{ hideFixHeader(); }catch{}
  unbindListeners();

  S.onBack = S.onFavToggle = S.isFav = null;
  S._tsBack = 0; S._tsFav = 0;
  S.root = S.statHeader = null;
}

export function setFavActive(on){
  try{
    const favEl = $('btnFixFav');
    if (!favEl) return;
    const active = !!on;
    favEl.classList.toggle('active', active);
    favEl.setAttribute('aria-pressed', active ? 'true' : 'false');
  }catch{}
}
