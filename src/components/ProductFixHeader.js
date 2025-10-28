// src/components/ProductFixHeader.js
// Фикс-хедер карточки товара: стабильные клики, безопасный «Назад», синхронизированное сердце
// Экспорт: activateProductFixHeader, deactivateProductFixHeader, setFavActive

let S = {
  // DOM
  root: null,
  back: null,
  fav:  null,
  statHeader: null,

  // API от Product.js
  onBack: null,          // () => void
  onFavToggle: null,     // () => void
  isFav: null,           // () => boolean

  // состояние
  shown: false,
  threshold: 24,
  listenersBound: false,

  // служебное
  _scrollTargets: [],
  _unbindDetectors: [],
  _onFavChanged: null,

  // стабильные ссылки на обработчики (чтобы снимать корректно)
  _handlers: {
    onScroll: null,
    onBackClick: null,
    onFavClick: null,
  },

  // лёгкая защита от дребезга
  _tsBack: 0,
  _tsFav: 0,
  _cooldownMs: 180,
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
  // иначе берём первое ненулевое
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
  // лёгкий антидребезг
  const now = Date.now();
  if (now - S._tsBack < S._cooldownMs) return;
  S._tsBack = now;

  try{
    // если история короткая или ссылка пришла «напрямую» — отправим на главную
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
  // визуал освежим после колбэка
  try {
    const on = !!(S.isFav && S.isFav());
    setFavActive(on);
  } catch {}
}

function bindListeners(){
  if (S.listenersBound) return;

  // скролл-лисенеры (один раз)
  S._handlers.onScroll = onScrollCheck;
  S._scrollTargets = getScrollTargets();
  for (const t of S._scrollTargets){
    if (t === window) window.addEventListener('scroll', S._handlers.onScroll, { passive:true });
    else t.addEventListener('scroll', S._handlers.onScroll, { passive:true });
  }
  // трекер активного скролл-контейнера
  S._unbindDetectors = S._scrollTargets.map(bindActiveTargetDetector);

  // клики по кнопкам (без once, стабильные ссылки)
  S._handlers.onBackClick = (e)=>{ e.preventDefault(); (S.onBack ? S.onBack() : safeBack()); };
  S._handlers.onFavClick  = (e)=>{ e.preventDefault(); doFavToggle(); };

  S.back.addEventListener('click', S._handlers.onBackClick, { passive:false });
  S.fav .addEventListener('click', S._handlers.onFavClick,  { passive:false });

  // глобальный синк избранного — если кто-то вне этого файла поменял
  S._onFavChanged = (ev)=>{
    try{
      // если пришёл id — можно было бы фильтровать, но здесь дёшево и достаточно
      const on = !!(S.isFav && S.isFav());
      setFavActive(on);
    }catch{}
  };
  window.addEventListener('fav:changed', S._onFavChanged);

  S.listenersBound = true;

  // первый расчёт видимости
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

  // клики
  try{ S.back.removeEventListener('click', S._handlers.onBackClick); }catch{}
  try{ S.fav .removeEventListener('click', S._handlers.onFavClick ); }catch{}

  // глобальное событие избранного
  try{ window.removeEventListener('fav:changed', S._onFavChanged); }catch{}

  S._handlers.onScroll = S._handlers.onBackClick = S._handlers.onFavClick = null;
  S._onFavChanged = null;

  S.listenersBound = false;
}

/* ---------------- ПУБЛИЧНОЕ API ---------------- */
export function activateProductFixHeader(opts = {}){
  // DOM
  S.root = $('productFixHdr');
  S.back = $('btnFixBack');
  S.fav  = $('btnFixFav');
  S.statHeader = document.querySelector('.app-header');

  if (!S.root || !S.back || !S.fav) return;

  // API
  S.onBack      = typeof opts.onBack === 'function' ? opts.onBack : null;
  S.onFavToggle = typeof opts.onFavToggle === 'function' ? opts.onFavToggle : null;
  S.isFav       = typeof opts.isFav === 'function' ? opts.isFav : null;

  S.threshold   = Number(opts.showThreshold || opts.threshold || 24) || 24;

  // визуальная инициализация fav
  try {
    const on = !!(S.isFav && S.isFav());
    setFavActive(on);
  } catch {}

  // убедиться, что контейнер кликабелен (если где-то переопределяли)
  S.root.style.pointerEvents = 'auto';

  bindListeners();
  onScrollCheck(); // мгновенный расчёт видимости
}

export function deactivateProductFixHeader(){
  // Скрываем слой и возвращаем статичный хедер
  try{ hideFixHeader(); }catch{}
  // Снимаем слушатели
  unbindListeners();

  // Сброс DOM-ссылок и коллбеков
  S.root = S.back = S.fav = S.statHeader = null;
  S.onBack = S.onFavToggle = S.isFav = null;

  // Сброс антидребезга
  S._tsBack = 0;
  S._tsFav  = 0;
}

export function setFavActive(on){
  try{
    if (!S.fav) return;
    const active = !!on;
    S.fav.classList.toggle('active', active);
    S.fav.setAttribute('aria-pressed', active ? 'true' : 'false');
  }catch{}
}
