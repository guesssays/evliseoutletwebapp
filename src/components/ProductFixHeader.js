// src/components/ProductFixHeader.js
// Фикс-хедер карточки товара: доступность, синхронизация с фаворитом, стабилизация кликов
// Экспорт: activateProductFixHeader, deactivateProductFixHeader, setFavActive

let _state = {
  root: null,
  back: null,
  fav: null,
  statHeader: null,

  onBack: null,
  onFavToggle: null,
  isFav: null,

  threshold: 0,
  shown: false,
  listenersBound: false,

  scrollTargets: [],
  _unbindDetectors: [],
  _onFavChanged: null,

  _handlers: {
    backClick: null,
    favClick: null,
    backTouch: null,
    favTouch: null,
    backPointer: null,
    favPointer: null,
  },

  // только логический лок — без disabled
  _lock: { back: false, fav: false },
};

function qs(id){ return document.getElementById(id); }

/* ===================== UNIVERSAL SCROLL ROOT DETECT ===================== */
function classicCandidates(){
  const arr = [];
  if (document.scrollingElement) arr.push(document.scrollingElement);
  const view = document.getElementById('view'); if (view) arr.push(view);
  const app  = document.getElementById('app');  if (app) arr.push(app);
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
      if ((oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight) {
        return el;
      }
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
function getScrollY(){
  if (__activeScrollTarget && __activeScrollTarget !== window){
    return __activeScrollTarget.scrollTop || 0;
  }
  const cands = getScrollTargets();
  for (const c of cands){
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
/* ====================================================================== */

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
  if (_state.shown) return;
  _state.shown = true;
  a11yShow(_state.root);
  if (_state.statHeader){
    _state.statHeader.classList.add('hidden');
    _state.statHeader.setAttribute('aria-hidden', 'true');
    _state.statHeader.setAttribute('inert', '');
  }
}
function hideFixHeader(){
  if (!_state.shown) return;
  _state.shown = false;
  a11yHide(_state.root);
  if (_state.statHeader){
    _state.statHeader.classList.remove('hidden');
    _state.statHeader.removeAttribute('aria-hidden');
    _state.statHeader.removeAttribute('inert');
  }
}
function onScrollCheck(){
  const y = getScrollY();
  if (y > _state.threshold) showFixHeader();
  else hideFixHeader();
}

/* -------- безопасный назад -------- */
function safeBack(){
  try{
    if (history.length <= 1){
      const h = String(location.hash||'');
      if (!h || h.startsWith('#/product/')) location.hash = '#/';
      else history.back();
    } else {
      history.back();
    }
  }catch{
    location.hash = '#/';
  }
}

/* -------- лёгкий анти-дабл без disabled -------- */
function guardClick(btnKey, _btnEl, cb){
  if (_state._lock[btnKey]) return;
  _state._lock[btnKey] = true;
  try { cb(); } catch {}
  setTimeout(()=>{ _state._lock[btnKey] = false; }, 250);
}

/* -------- безопасный вызов обработчика pointer -------- */
function withPointerSafeguards(e, fn){
  try { e.preventDefault(); e.stopPropagation(); } catch {}
  try { e.target?.releasePointerCapture?.(e.pointerId); } catch {}
  try { fn(); } catch {}
  // страховка: гарантируем, что контейнер остаётся кликабельным
  try { _state.root && (_state.root.style.pointerEvents = 'auto'); } catch {}
}

function bindListeners(){
  if (_state.listenersBound) return;
  _state.listenersBound = true;

  // Страховки от CSS
  try {
    if (_state.root){
      _state.root.style.pointerEvents = 'auto';
      _state.root.style.zIndex = '999';
      _state.root.setAttribute('role','region');
    }
    if (_state.back){
      _state.back.style.pointerEvents = 'auto';
      _state.back.style.touchAction   = 'manipulation';
      _state.back.setAttribute('role','button');
      _state.back.setAttribute('tabindex','0');
      _state.back.removeAttribute('disabled');
      _state.back.removeAttribute('aria-disabled');
    }
    if (_state.fav){
      _state.fav.style.pointerEvents  = 'auto';
      _state.fav.style.touchAction    = 'manipulation';
      _state.fav.setAttribute('role','button');
      _state.fav.setAttribute('tabindex','0');
      _state.fav.removeAttribute('disabled');
      _state.fav.removeAttribute('aria-disabled');
    }
  } catch {}

  const backDo = ()=> guardClick('back', _state.back, (_state.onBack || safeBack));

  const favDo  = ()=> guardClick('fav',  _state.fav,  ()=>{
    const next = !_state.isFav?.();
    _state.onFavToggle && _state.onFavToggle();
    try { setFavActive(next); } catch {}
    try { window.dispatchEvent(new CustomEvent('fav:changed', { detail:{ active: next } })); } catch {}
  });

  // Основной канал — pointerup (без capture), чтобы не «вешать» фазу и не блокировать другие слушатели
  _state._handlers.backPointer = (e)=>{
    if (e.button === 0 || e.button === undefined){ withPointerSafeguards(e, backDo); }
  };
  _state._handlers.favPointer  = (e)=>{
    if (e.button === 0 || e.button === undefined){ withPointerSafeguards(e, favDo); }
  };

  _state.back?.addEventListener('pointerup', _state._handlers.backPointer, { passive:false });
  _state.fav?.addEventListener('pointerup',  _state._handlers.favPointer,  { passive:false });

  // Резервные каналы — click + touchend
  _state._handlers.backClick = (e)=>{ withPointerSafeguards(e, backDo); };
  _state._handlers.favClick  = (e)=>{ withPointerSafeguards(e, favDo); };
  _state.back?.addEventListener('click', _state._handlers.backClick, { passive:false });
  _state.fav?.addEventListener('click',  _state._handlers.favClick,  { passive:false });

  _state._handlers.backTouch = (e)=>{ withPointerSafeguards(e, backDo); };
  _state._handlers.favTouch  = (e)=>{ withPointerSafeguards(e, favDo); };
  _state.back?.addEventListener('touchend', _state._handlers.backTouch, { passive:false });
  _state.fav?.addEventListener('touchend',  _state._handlers.favTouch,  { passive:false });

  // Подписки на скролл-контейнеры
  _state.scrollTargets = getScrollTargets();
  _state._unbindDetectors = [];
  for (const t of _state.scrollTargets){
    const un = bindActiveTargetDetector(t);
    _state._unbindDetectors.push(un);
    if (t === window){
      window.addEventListener('scroll', onScrollCheck, { passive:true });
      window.addEventListener('resize', onScrollCheck);
    } else {
      t.addEventListener('scroll', onScrollCheck, { passive:true });
      t.addEventListener('resize', onScrollCheck);
    }
  }

  // Глобальная синхронизация фаворита
  _state._onFavChanged = (e)=> {
    try {
      if (e && e.detail && typeof e.detail.active === 'boolean') {
        setFavActive(e.detail.active);
      } else {
        setFavActive(!!_state.isFav?.());
      }
    } catch {}
  };
  window.addEventListener('fav:changed', _state._onFavChanged);
}

function unbindListeners(){
  if (!_state.listenersBound) return;
  _state.listenersBound = false;

  try{
    if (_state.back){
      _state.back.removeEventListener('pointerup', _state._handlers.backPointer);
      _state.back.removeEventListener('click', _state._handlers.backClick);
      _state.back.removeEventListener('touchend', _state._handlers.backTouch);
    }
    if (_state.fav){
      _state.fav.removeEventListener('pointerup', _state._handlers.favPointer);
      _state.fav.removeEventListener('click', _state._handlers.favClick);
      _state.fav.removeEventListener('touchend', _state._handlers.favTouch);
    }
  }catch{}

  _state._handlers = { backClick:null, favClick:null, backTouch:null, favTouch:null, backPointer:null, favPointer:null };
  _state._lock = { back:false, fav:false };

  for (const t of _state.scrollTargets){
    if (t === window){
      window.removeEventListener('scroll', onScrollCheck);
      window.removeEventListener('resize', onScrollCheck);
    } else {
      t.removeEventListener('scroll', onScrollCheck);
      t.removeEventListener('resize', onScrollCheck);
    }
  }
  _state.scrollTargets = [];

  if (_state._unbindDetectors?.length){
    _state._unbindDetectors.forEach(fn=>{ try{ fn(); }catch{} });
    _state._unbindDetectors = [];
  }
  if (_state._onFavChanged){
    window.removeEventListener('fav:changed', _state._onFavChanged);
    _state._onFavChanged = null;
  }
}

/** Публично: синхронизация состояния «избранного» */
export function setFavActive(on){
  try {
    const b = _state.fav || qs('btnFixFav');
    if (!b) return;
    const val = !!on;
    b.classList.toggle('active', val);
    b.setAttribute('aria-pressed', String(val));
    // гарантируем кликабельность после изменения классов
    b.style.pointerEvents = 'auto';
  } catch {}
}

/** Активировать фикс-хедер на странице товара */
export function activateProductFixHeader({
  isFav = ()=>false,
  onBack = ()=>safeBack(),
  onFavToggle = ()=>{},
  showThreshold = 0,
} = {}){
  _state.root = qs('productFixHdr');
  _state.back = qs('btnFixBack');
  _state.fav  = qs('btnFixFav');
  _state.statHeader = document.querySelector('.app-header') || null;
  _state.isFav = isFav;
  _state.onBack = onBack;
  _state.onFavToggle = onFavToggle;
  _state.threshold = Number(showThreshold)||0;

  if (!_state.root){
    _state = { ..._state, shown:false };
    return;
  }

  // страхуем от CSS
  try {
    _state.root.style.pointerEvents = 'auto';
    _state.back && (_state.back.style.pointerEvents = 'auto');
    _state.fav  && (_state.fav.style.pointerEvents  = 'auto');
    _state.back && (_state.back.style.touchAction   = 'manipulation');
    _state.fav  && (_state.fav.style.touchAction    = 'manipulation');
    _state.back && (_state.back.removeAttribute('disabled'));
    _state.fav  && (_state.fav.removeAttribute('disabled'));
  } catch {}

  // начальное состояние сердца
  setFavActive(!!isFav());

  // изначально скрыт до показа
  if (!_state.root.classList.contains('show')){
    _state.root.setAttribute('aria-hidden','true');
    _state.root.setAttribute('inert','');
  }

  bindListeners();
  onScrollCheck();
  if (_state.threshold <= 0) showFixHeader();
}

/** Деактивировать фикс-хедер (уход со страницы) */
export function deactivateProductFixHeader(){
  hideFixHeader();
  unbindListeners();
  _state = {
    root:null, back:null, fav:null,
    statHeader:_state.statHeader,
    onBack:null, onFavToggle:null, isFav:null,
    threshold:0, shown:false, listenersBound:false,
    scrollTargets:[], _unbindDetectors:[], _onFavChanged:null,
    _handlers:{ backClick:null, favClick:null, backTouch:null, favTouch:null, backPointer:null, favPointer:null },
    _lock:{ back:false, fav:false },
  };
}
