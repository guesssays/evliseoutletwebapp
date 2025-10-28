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
    backPointer: null,
    favPointer: null,
  },

  _lock: { back: false, fav: false },
  _cooldownUntil: 0, // защита от обратного отката после локального тоггла
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
function guardClick(btnKey, cb){
  if (_state._lock[btnKey]) return;
  _state._lock[btnKey] = true;
  try { cb(); } catch {}
  setTimeout(()=>{ _state._lock[btnKey] = false; }, 200);
}

function withPointerSafeguards(e, fn){
  try { e.preventDefault(); e.stopPropagation(); } catch {}
  try { e.target?.releasePointerCapture?.(e.pointerId); } catch {}
  try { fn(); } catch {}
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

  const backDo = ()=> guardClick('back', (_state.onBack || safeBack));

  const favDo  = ()=> guardClick('fav', ()=>{
    // Локальное будущее состояние
    const next = !_state.isFav?.();

    // Ставим КУЛДАУН: игнор входящих ресинков ~220мс
    _state._cooldownUntil = Date.now() + 220;

    // Реальный тоггл состояния (во внешнем слое)
    _state.onFavToggle && _state.onFavToggle();

    // Мгновенно обновляем кнопку фикс-хедера
    try { setFavActive(next); } catch {}

    // Широковещательная синхронизация
    try {
      window.dispatchEvent(new CustomEvent('fav:changed', { detail:{ active: next } }));
    } catch {}
  });

  // ЕДИНСТВЕННЫЙ канал: pointerup (никаких click/touchend)
  _state._handlers.backPointer = (e)=>{ if (e.button === 0 || e.button === undefined){ withPointerSafeguards(e, backDo); } };
  _state._handlers.favPointer  = (e)=>{ if (e.button === 0 || e.button === undefined){ withPointerSafeguards(e, favDo); } };

  _state.back?.addEventListener('pointerdown', _state._handlers.backPointer, { passive:false });
  _state.fav?.addEventListener('pointerdown',  _state._handlers.favPointer,  { passive:false });

  // страховка от «залипания» pointer-capture
  const releaseAll = (e)=>{
    try{ e.target?.releasePointerCapture?.(e.pointerId); }catch{}
    // на всякий — включаем кликабельность слоёв
    try{ _state.root && (_state.root.style.pointerEvents = 'auto'); }catch{}
    try{ _state.back && (_state.back.style.pointerEvents = 'auto'); }catch{}
    try{ _state.fav  && (_state.fav.style.pointerEvents  = 'auto'); }catch{}
    // снимаем логическую блокировку, если вдруг осталась
    _state._lock.back = false; _state._lock.fav = false;
  };
  _state.back?.addEventListener('lostpointercapture', releaseAll, { passive:true });
  _state.fav?.addEventListener('lostpointercapture',  releaseAll, { passive:true });
  _state.back?.addEventListener('pointercancel',      releaseAll, { passive:true });
  _state.fav?.addEventListener('pointercancel',       releaseAll, { passive:true });


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
    // Если недавно локально переключали — игнорим внешние перезаписи
    if (Date.now() < _state._cooldownUntil) return;
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

// стало: снимаем pointerdown, потому что именно его вешаем
try{
  if (_state.back){
    _state.back.removeEventListener('pointerdown', _state._handlers.backPointer);
    _state.back.removeEventListener('lostpointercapture', ()=>{});
    _state.back.removeEventListener('pointercancel', ()=>{});
  }
  if (_state.fav){
    _state.fav.removeEventListener('pointerdown', _state._handlers.favPointer);
    _state.fav.removeEventListener('lostpointercapture', ()=>{});
    _state.fav.removeEventListener('pointercancel', ()=>{});
  }
}catch{}


  _state._handlers = { backPointer:null, favPointer:null };
  _state._lock = { back:false, fav:false };
  _state._cooldownUntil = 0;

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

  try {
    _state.root.style.pointerEvents = 'auto';
    _state.back && (_state.back.style.pointerEvents = 'auto');
    _state.fav  && (_state.fav.style.pointerEvents  = 'auto');
    _state.back && (_state.back.style.touchAction   = 'manipulation');
    _state.fav  && (_state.fav.style.touchAction    = 'manipulation');
  } catch {}

  setFavActive(!!isFav());

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
    _handlers:{ backPointer:null, favPointer:null },
    _lock:{ back:false, fav:false },
    _cooldownUntil: 0,
  };
}
