// Фикс-хедер карточки товара: доступность, синхронизация с фаворитом, стабилизация нажатий
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
  _handlers: { backClick:null, backPtr:null, favClick:null, favPtr:null },
  _pressGuard: { back:0, fav:0 }, // анти-дабл-тап
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

/* -------- анти-дабл-тап (pointerup + click в одном тапе) -------- */
function handleOnce(key, fn){
  return (e) => {
    e.preventDefault();
    e.stopPropagation();
    const now = Date.now();
    if (now - (_state._pressGuard[key]||0) < 300) return; // игнорим дубликат в 300мс
    _state._pressGuard[key] = now;
    try { fn(); } catch {}
  };
}

function bindListeners(){
  if (_state.listenersBound) return;
  _state.listenersBound = true;

  const backDo = ()=>{ (_state.onBack || safeBack)(); };
  const favDo  = ()=>{ 
    _state.onFavToggle && _state.onFavToggle();
    // после внешнего тоггла — читаем актуальное значение у источника
    try { setFavActive(!!_state.isFav?.()); } catch {}
    // и транслируем наверх (на случай, если onFavToggle не шлёт событие сам)
    try {
      window.dispatchEvent(new CustomEvent('fav:changed', { detail:{ active: !!_state.isFav?.() } }));
    } catch {}
  };

  // обёртки с дедупликацией
  const backHandler = handleOnce('back', backDo);
  const favHandler  = handleOnce('fav',  favDo);

  // Сохраняем ссылки для removeEventListener
  _state._handlers.backClick = backHandler;
  _state._handlers.backPtr   = backHandler;
  _state._handlers.favClick  = favHandler;
  _state._handlers.favPtr    = favHandler;

  // Надёжно: в некоторых webview надёжнее слушать и click, и pointerup,
  // но с анти-дабл-тапом это безопасно.
  _state.back?.addEventListener('pointerup', backHandler, { passive:false });
  _state.back?.addEventListener('click',     backHandler, { passive:false });

  _state.fav?.addEventListener('pointerup',  favHandler,  { passive:false });
  _state.fav?.addEventListener('click',      favHandler,  { passive:false });

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

  // Глобальная синхронизация фаворита (из Hero и т.д.)
  _state._onFavChanged = ()=> {
    try { setFavActive(!!_state.isFav?.()); } catch {}
  };
  window.addEventListener('fav:changed', _state._onFavChanged);
}

function unbindListeners(){
  if (!_state.listenersBound) return;
  _state.listenersBound = false;

  try{
    if (_state.back){
      _state.back.removeEventListener('click',     _state._handlers.backClick);
      _state.back.removeEventListener('pointerup', _state._handlers.backPtr);
    }
    if (_state.fav){
      _state.fav.removeEventListener('click',      _state._handlers.favClick);
      _state.fav.removeEventListener('pointerup',  _state._handlers.favPtr);
    }
  }catch{}

  _state._handlers = { backClick:null, backPtr:null, favClick:null, favPtr:null };
  _state._pressGuard = { back:0, fav:0 };

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
    _handlers:{ backClick:null, backPtr:null, favClick:null, favPtr:null },
    _pressGuard:{ back:0, fav:0 },
  };
}
