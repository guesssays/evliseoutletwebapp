// Фикс-хедер карточки товара: доступность, синхронизация с фаворитом, управление показом
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
};

function qs(id){ return document.getElementById(id); }

/* ===================== UNIVERSAL SCROLL ROOT DETECT ===================== */
// 1) базовые кандидаты
function classicCandidates(){
  const arr = [];
  if (document.scrollingElement) arr.push(document.scrollingElement);
  const view = document.getElementById('view'); if (view) arr.push(view);
  const app  = document.getElementById('app');  if (app) arr.push(app);
  arr.push(window);
  return arr;
}

// 2) «активный» таргет — тот, по которому недавно был wheel/touchmove
let __activeScrollTarget = null;

// 3) если страница скроллится в другом контейнере — найдём любой scrollable
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

// 4) вернуть набор таргетов для подписки
function getScrollTargets(){
  const out = new Set();
  if (__activeScrollTarget) out.add(__activeScrollTarget);
  for (const c of classicCandidates()) out.add(c);
  const auto = findAnyScrollable();
  if (auto) out.add(auto);
  return Array.from(out);
}

// 5) унифицированное чтение текущего scrollY
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

// 6) подписка для фиксации active target
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
  try {
    if (el.contains(document.activeElement)) document.activeElement.blur();
  } catch {}
  el.classList.remove('show');

  // Дадим фокусу «уйти» до скрытия для читателей экрана
  requestAnimationFrame(()=>{
    requestAnimationFrame(()=>{
      el.setAttribute('aria-hidden', 'true');
      el.setAttribute('inert', '');
    });
  });
}

function showFixHeader(){
  if (_state.shown) return;
  _state.shown = true;
  a11yShow(_state.root);

  // Скрываем статичный хедер синхронно и делаем его не фокусируемым
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

function bindListeners(){
  if (_state.listenersBound) return;
  _state.listenersBound = true;

  _state.back?.addEventListener('click', (e)=>{
    e.preventDefault();
    _state.onBack && _state.onBack();
  });

  _state.fav?.addEventListener('click', (e)=>{
    e.preventDefault();
    _state.onFavToggle && _state.onFavToggle();
    // локальная подсветка по текущему значению isFav()
    try {
      const on = !!_state.isFav?.();
      setFavActive(on);
    } catch {}
  });

  // Подписываемся на все релевантные скролл-контейнеры
  _state.scrollTargets = getScrollTargets();
  _state._unbindDetectors = [];

  for (const t of _state.scrollTargets){
    // фиксируем активный таргет
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
}

function unbindListeners(){
  if (!_state.listenersBound) return;
  _state.listenersBound = false;

  // клик-хендлеры снимаем пересозданием нод (безопасный трюк, чтобы не держать ссылки)
  try {
    if (_state.back){
      const clone = _state.back.cloneNode(true);
      _state.back.parentNode.replaceChild(clone, _state.back);
      _state.back = clone;
    }
    if (_state.fav){
      const clone = _state.fav.cloneNode(true);
      _state.fav.parentNode.replaceChild(clone, _state.fav);
      _state.fav = clone;
    }
  } catch {}

  // Снимаем со всех скролл-таргетов
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

  if (_state._unbindDetectors && _state._unbindDetectors.length){
    _state._unbindDetectors.forEach(fn => { try{ fn(); }catch{} });
    _state._unbindDetectors = [];
  }
}

/** Публично: синхронизация состояния «избранного» */
export function setFavActive(on){
  try {
    const b = _state.fav || qs('btnFixFav');
    if (!b) return;
    b.classList.toggle('active', !!on);
    b.setAttribute('aria-pressed', String(!!on));
  } catch {}
}

/** Активировать фикс-хедер на странице товара */
export function activateProductFixHeader({
  isFav = ()=>false,
  onBack = ()=>history.back(),
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

  // Поднять начальное состояние фаворита
  setFavActive(!!isFav());

  // Изначально скрыт для SR до момента показа
  if (!_state.root.classList.contains('show')){
    _state.root.setAttribute('aria-hidden','true');
    _state.root.setAttribute('inert','');
  }

  bindListeners();

  // Начальный расчёт показа
  onScrollCheck();
  if (_state.threshold <= 0) showFixHeader();
}

/** Деактивировать фикс-хедер (уход со страницы) */
export function deactivateProductFixHeader(){
  hideFixHeader();
  unbindListeners();

  // Чистка состояния
  _state = {
    root: null,
    back: null,
    fav: null,
    statHeader: _state.statHeader, // видимость вернули выше
    onBack: null,
    onFavToggle: null,
    isFav: null,
    threshold: 0,
    shown: false,
    listenersBound: false,
    scrollTargets: [],
    _unbindDetectors: [],
  };
}
