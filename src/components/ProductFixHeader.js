// src/components/ProductFixHeader.js
// Фикс-хедер карточки товара: стабильные клики, без двойных срабатываний,
// чистая активация/деактивация, синк избранного.

import { ScrollReset } from '../core/scroll-reset.js';

const S = {
  root: null,
  statHeader: null,
  btnBack: null,
  btnFav: null,

  onBack: null,
  onFavToggle: null,
  isFav: null,

  shown: false,
  threshold: 24,

  // текущее подвешенное состояние
  _scrollTargets: [],
  _unbindDetectors: [],
  _observer: null,
  _bound: false,

  // антидребезг
  _cooldownMs: 200,
  _tsBack: 0,
  _tsFav: 0,
};

const $ = (id) => document.getElementById(id);

/* ------------ прокрутка ------------ */
function getScrollY() {
  return window.scrollY || document.documentElement.scrollTop || 0;
}

function onScrollCheck() {
  const y = getScrollY();
  if (y > S.threshold) showFixHeader();
  else hideFixHeader();
}

function bindScroll() {
  window.addEventListener('scroll', onScrollCheck, { passive: true });
  S._scrollTargets = [window];
}
function unbindScroll() {
  for (const t of S._scrollTargets) {
    try { t.removeEventListener('scroll', onScrollCheck); } catch {}
  }
  S._scrollTargets = [];
}

/* ------------ показы/скрытия ------------ */
function a11yShow(el){
  if (!el) return;
  el.classList.add('show');
  el.removeAttribute('aria-hidden');
  el.removeAttribute('inert');
  // гарантируем кликабельность контейнера и его детей
  el.style.pointerEvents = 'auto';
}
function a11yHide(el){
  if (!el) return;
  try{ if (el.contains(document.activeElement)) document.activeElement.blur(); }catch{}
  el.classList.remove('show');
  // прячем для ассистивок и отключаем фокус
  el.setAttribute('aria-hidden','true');
  el.setAttribute('inert','');
  // и клики не нужны, когда скрыт
  el.style.pointerEvents = 'none';
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

/* ------------ клики ------------ */
function safeBack(ev){
  ev?.preventDefault?.();
  try { ScrollReset.suppress(900); ScrollReset.quiet(900); } catch {}

  const now = Date.now();
  if (now - S._tsBack < S._cooldownMs) return;
  S._tsBack = now;

  try{
    if (history.length <= 1){
      const h = String(location.hash||'');
      if (!h || h.startsWith('#/product/')) { location.hash = '#/'; return; }
    }
    history.back();
  }catch{
    location.hash = '#/';
  }
}

function doFavToggle(ev){
  ev?.preventDefault?.();
  try { ScrollReset.quiet(900); } catch {}

  const now = Date.now();
  if (now - S._tsFav < S._cooldownMs) return;
  S._tsFav = now;

  try { S.onFavToggle && S.onFavToggle(); } catch {}

  // локально подсветим по факту
  const on = !!(S.isFav && S.isFav());
  setFavActive(on);

  // широковещательный синк (без id — твой слушатель в Product.js пропустит)
  try {
    window.dispatchEvent(new CustomEvent('fav:changed', { detail:{ active:on } }));
  } catch {}
}

function bindButtons() {
  const back = $('btnFixBack');
  const fav  = $('btnFixFav');

  // Снимем старые обработчики, если были
  if (S.btnBack && S.btnBack !== back) {
    try { S.btnBack.removeEventListener('click', safeBack); } catch {}
  }
  if (S.btnFav && S.btnFav !== fav) {
    try { S.btnFav.removeEventListener('click', doFavToggle); } catch {}
  }

  S.btnBack = back;
  S.btnFav  = fav;

  if (back) {
    back.style.pointerEvents = 'auto';
    back.addEventListener('click', safeBack, { passive:false });
  }
  if (fav) {
    fav.style.pointerEvents = 'auto';
    fav.addEventListener('click', doFavToggle, { passive:false });
  }
}

/* ------------ мютейшны (на случай перерисовки иконок) ------------ */
function watchMutations() {
  if (!S.root) return;
  try {
    S._observer = new MutationObserver(() => bindButtons());
    S._observer.observe(S.root, { childList: true, subtree: true });
  } catch {}
}
function unwatchMutations() {
  try { S._observer?.disconnect(); } catch {}
  S._observer = null;
}

/* ------------ публичное API ------------ */
export function activateProductFixHeader(opts = {}){
  S.root = $('productFixHdr');
  S.statHeader = document.querySelector('.app-header');
  if (!S.root) return;

  S.onBack      = typeof opts.onBack === 'function' ? opts.onBack : safeBack;
  S.onFavToggle = typeof opts.onFavToggle === 'function' ? opts.onFavToggle : null;
  S.isFav       = typeof opts.isFav === 'function' ? opts.isFav : null;
  S.threshold   = Number(opts.showThreshold || opts.threshold || 24) || 24;

  // первичное состояние сердца
  try { setFavActive(!!(S.isFav && S.isFav())); } catch {}

  // делаем контейнер кликабельным (НЕ ставим pointer-events:none!)
  S.root.style.pointerEvents = 'auto';

  // биндим
  bindScroll();
  bindButtons();
  watchMutations();

  // начальный прогон
  onScrollCheck();
  S._bound = true;
}

export function deactivateProductFixHeader(){
  if (!S._bound) return;

  hideFixHeader();

  // снять скролл и мютейшны
  unbindScroll();
  unwatchMutations();

  // снять клики
  try { S.btnBack?.removeEventListener('click', safeBack); } catch {}
  try { S.btnFav?.removeEventListener('click', doFavToggle); } catch {}
  S.btnBack = S.btnFav = null;

  // сброс
  S.onBack = S.onFavToggle = S.isFav = null;
  S._tsBack = 0; S._tsFav = 0;

  S._bound = false;
}

export function setFavActive(on){
  const favEl = $('btnFixFav');
  if (!favEl) return;
  const active = !!on;
  favEl.classList.toggle('active', active);
  favEl.setAttribute('aria-pressed', active ? 'true' : 'false');
}
