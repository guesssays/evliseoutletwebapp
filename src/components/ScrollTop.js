// src/components/ScrollTop.js
// Кнопка «Наверх» (ТОЛЬКО на главной). Ультра-надёжное распознавание «главной»,
// поддержка любых скролл-контейнеров, живые обработчики, авто-ребиндинг,
// периодический поллер на случай «молчаливых» скроллов.

/* -------------------- УЛУЧШЕННОЕ РАСПОЗНАВАНИЕ ГЛАВНОЙ -------------------- */
/**
 * Главная считается включённой, если:
 *  1) hash == '', '#', '#/', '#?…', '#/?…'
 *  2) или в DOM присутствует grid главной: #productGrid (рендерит Home.js)
 */
function isHome() {
  const raw = String(location.hash || '');
  if (raw === '' || raw === '#') return true;

  let path = raw.slice(1);
  if (path.startsWith('?')) return true;      // '#?utm=...'
  if (path === '' || path === '/') return true;
  if (path.startsWith('/?')) return true;     // '#/?utm=...'

  // если роутер уже отрисовал главную — будет grid
  if (document.getElementById('productGrid')) return true;

  path = path.split('?')[0].replace(/^\/+/, '');
  return path === '';
}

/* -------------------------- ПОИСК СКРОЛЛ-ИСТОЧНИКОВ ------------------------ */
function classicCandidates(){
  const arr = [];
  if (document.scrollingElement) arr.push(document.scrollingElement);
  const view = document.getElementById('view'); if (view) arr.push(view);
  const app  = document.getElementById('app');  if (app)  arr.push(app);
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
      // допускаем auto/scroll; «overlay» встречается редко, но попадает как 'auto'
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
  // 1) если уже знаем активную цель
  if (__activeScrollTarget && __activeScrollTarget !== window){
    return __activeScrollTarget.scrollTop || 0;
  }
  // 2) берём МАКСИМУМ из всех возможных источников
  let maxY = 0;
  const cands = getScrollTargets();
  for (const c of cands){
    if (c === window){
      const y = window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
      if (y > maxY) maxY = y;
    } else if (c && c.scrollHeight > c.clientHeight){
      const y = c.scrollTop || 0;
      if (y > maxY) maxY = y;
    }
  }
  return maxY;
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

/* ----------------------------- СКРОЛЛ К ВЕРХУ ------------------------------ */
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

/* -------------------------------- ПУБЛИЧНОЕ -------------------------------- */
export function mountScrollTop(threshold = 400) {
  const btn = document.getElementById('scrollTopBtn');
  if (!btn) return;

  // защита от повторной инициализации
  if (btn.dataset.bound === '1') {
    try { btn.dispatchEvent(new Event('__force_update__')); } catch {}
    return;
  }
  btn.dataset.bound = '1';

  const hide = () => {
    try { if (document.activeElement === btn) document.activeElement.blur(); } catch {}
    btn.setAttribute('hidden', '');
    btn.setAttribute('aria-hidden', 'true');
    btn.setAttribute('inert', '');
    // страховка на случай специфичных стилей
    btn.style.display = 'none';
  };

  const show = () => {
    btn.removeAttribute('hidden');
    btn.removeAttribute('aria-hidden');
    btn.removeAttribute('inert');
    // принудительно, если где-то задано display:none
    btn.style.display = 'flex';
  };

  const update = () => {
    // ТОЛЬКО на главной
    if (!isHome()) { hide(); return; }
    const y = getScrollY();
    if (y > threshold) show(); else hide();
  };

  // Клик — живой (+ очистка памяти скролла главной)
  btn.addEventListener('click', () => {
    try { document.activeElement?.blur?.(); } catch {}
  
    scrollToTop();
  });

  // Внутренний форс-апдейт (если mount вызывают повторно)
  btn.addEventListener('__force_update__', () => update());

  /* -------- биндинг скроллов + безопасный ребиндинг при hashchange -------- */
  let targets = [];
  let unbinds = [];
  const onScroll = () => update();
  const onResize = () => update();

  function unbindAll(){
    for (const t of targets){
      try{
        if (t === window){
          window.removeEventListener('scroll', onScroll);
          window.removeEventListener('resize', onResize);
        } else {
          t.removeEventListener('scroll', onScroll);
          t.removeEventListener('resize', onResize);
        }
      }catch{}
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
        // не все элементы шлют resize — это безопасно
        t.addEventListener('resize', onResize);
      }
    }
    update(); // моментальный пересчёт
  }

  hide();
  bindAll();

  const onHash = () => {
    hide();
    unbindAll();
    // даём роутеру дорендерить DOM
    setTimeout(() => { bindAll(); }, 0);
  };
  window.addEventListener('hashchange', onHash);

  // ПОЛЛЕР (как последняя линия обороны на экзотических раскладках скролла)
  const POLL_MS = 250;
  const pollId = setInterval(update, POLL_MS);

  // Возвращаем размонтаж — на будущее
  return () => {
    clearInterval(pollId);
    window.removeEventListener('hashchange', onHash);
    unbindAll();
    try { delete btn.dataset.bound; } catch {}
    hide();
  };
}
