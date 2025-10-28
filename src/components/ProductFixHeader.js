// src/components/ProductFixHeader.js
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
  scrollTargets: [], // << добавили: на каких элементах слушаем scroll/resize
};

function qs(id){ return document.getElementById(id); }

/* ==== универсальный скролл ==== */
function getScrollContainerCandidates(){
  const list = [];
  // 1) приоритет — документ
  if (document.scrollingElement) list.push(document.scrollingElement);
  // 2) основной контент
  const view = document.getElementById('view');
  if (view) list.push(view);
  const app = document.getElementById('app');
  if (app) list.push(app);
  // 3) окно — в самом конце
  list.push(window);
  // Убираем дубли
  return Array.from(new Set(list));
}
function getScrollY(){
  // Берём первый контейнер, у которого реально есть прокрутка
  const cands = getScrollContainerCandidates();
  for (const c of cands){
    if (c === window) {
      const y = window.scrollY || document.documentElement.scrollTop || 0;
      if (y) return y;
    } else {
      // элемент
      const y = c.scrollTop || 0;
      // если контейнер реально скроллится, берём его
      if (c.scrollHeight > c.clientHeight) return y;
    }
  }
  // по умолчанию
  return window.scrollY || document.documentElement.scrollTop || 0;
}

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
  el.setAttribute('aria-hidden', 'true');
  el.setAttribute('inert', '');
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
    try {
      const on = !!_state.isFav?.();
      setFavActive(on);
    } catch {}
  });

  // Подписываемся на несколько возможных скролл-контейнеров
  _state.scrollTargets = getScrollContainerCandidates();
  for (const t of _state.scrollTargets){
    // разные API у window/элемента
    if (t === window) {
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
    if (t === window) {
      window.removeEventListener('scroll', onScrollCheck);
      window.removeEventListener('resize', onScrollCheck);
    } else {
      t.removeEventListener('scroll', onScrollCheck);
      t.removeEventListener('resize', onScrollCheck);
    }
  }
  _state.scrollTargets = [];
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

  // Убедимся, что корень изначально скрыт для SR до момента показа
  if (!_state.root.classList.contains('show')){
    _state.root.setAttribute('aria-hidden','true');
    _state.root.setAttribute('inert','');
  }

  bindListeners();

  // Начальный расчёт показа
  onScrollCheck();
  // если порог нулевой — показать сразу
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
    statHeader: _state.statHeader, // вернули видимость выше
    onBack: null,
    onFavToggle: null,
    isFav: null,
    threshold: 0,
    shown: false,
    listenersBound: false,
    scrollTargets: [],
  };
}
