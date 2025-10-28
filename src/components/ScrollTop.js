// src/components/ScrollTop.js
// Кнопка «Наверх»: показывается ТОЛЬКО на главной (#/), корректная доступность,
// живые обработчики без одноразовости, поддержка внутренних скролл-контейнеров.

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

/** Главная страница? Разрешаем пустой хеш, '#', '#/' и вариации с query. */
function isHome(){
  const h = String(location.hash || '');
  if (h === '' || h === '#' || h === '#/') return true;
  // допустим '#/?utm=...' — тоже главная
  if (h.startsWith('#/?')) return true;
  return false;
}

function scrollToTop(){
  const cands = getScrollTargets();
  let did = false;
  for (const c of cands){
    if (c === window){
      window.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
      did = true;
    } else if (c.scrollHeight > c.clientHeight){
      c.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
      did = true;
    }
  }
  if (!did){
    try { (document.documentElement || document.body).scrollTo({ top:0, behavior:'smooth' }); } catch {}
  }
}

export function mountScrollTop(threshold = 400) {
  const btn = document.getElementById('scrollTopBtn');
  if (!btn) return;

  const hide = () => {
    try { if (document.activeElement === btn) document.activeElement.blur(); } catch {}
    btn.setAttribute('hidden', '');
    btn.setAttribute('aria-hidden', 'true');
    btn.setAttribute('inert', '');
  };

  const show = () => {
    btn.removeAttribute('hidden');
    btn.removeAttribute('aria-hidden');
    btn.removeAttribute('inert');
  };

  const update = () => {
    // Появляется ТОЛЬКО на главной
    if (!isHome()) { hide(); return; }
    const y = getScrollY();
    if (y > threshold) show(); else hide();
  };

  // Клик — всегда живой (без одноразовости)
  btn.addEventListener('click', () => {
    try { document.activeElement?.blur?.(); } catch {}
    scrollToTop();
  });

  // --- Биндинг скролл-источников с возможной перебиндовкой при смене маршрута ---
  let targets = [];
  let unbinds = [];
  const onScroll = () => update();
  const onResize = () => update();

  function unbindAll(){
    for (const t of targets){
      if (t === window){
        window.removeEventListener('scroll', onScroll);
        window.removeEventListener('resize', onResize);
      } else {
        t.removeEventListener('scroll', onScroll);
        t.removeEventListener('resize', onResize);
      }
    }
    targets = [];
    unbinds.forEach(fn=>{ try{ fn(); }catch{} });
    unbinds = [];
  }

  function bindAll(){
    targets = getScrollTargets();
    for (const t of targets){
      unbinds.push(bindActiveTargetDetector(t));
      if (t === window){
        window.addEventListener('scroll', onScroll, { passive: true });
        window.addEventListener('resize', onResize);
      } else {
        t.addEventListener('scroll', onScroll, { passive: true });
        // не все элементы бросают resize, но безвредно
        t.addEventListener('resize', onResize);
      }
    }
    // сразу пересчитать
    update();
  }

  // первая инициализация
  hide();
  bindAll();

  // При смене маршрута — перебиндить слушатели (контейнер мог смениться)
  const onHash = () => {
    // Сначала спрятать (если ушли с главной), потом перебиндить и пересчитать
    hide();
    unbindAll();
    // небольшой next-tick, чтобы DOM успел перерисоваться
    setTimeout(() => { bindAll(); }, 0);
  };
  window.addEventListener('hashchange', onHash);

  // Вернуть функцию для полного размонтажа (если понадобится)
  return () => {
    window.removeEventListener('hashchange', onHash);
    unbindAll();
  };
}
