// src/components/ScrollTop.js
// Кнопка «Наверх» (ТОЛЬКО на главной).
// Теперь ПОЯВЛЯЕТСЯ, когда пользователь начинает листать ВВЕРХ,
// находясь в нижней части страницы (или достаточно далеко от верха).

/* -------------------- УЛУЧШЕННОЕ РАСПОЗНАВАНИЕ ГЛАВНОЙ -------------------- */
function isHome() {
  const raw = String(location.hash || '');
  if (raw === '' || raw === '#') return true;

  let path = raw.slice(1);
  if (path.startsWith('?')) return true;      // '#?utm=...'
  if (path === '' || path === '/') return true;
  if (path.startsWith('/?')) return true;     // '#/?utm=...'

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

// Текущая вертикальная позиция (максимальная среди кандидатов)
function getScrollY(){
  if (__activeScrollTarget && __activeScrollTarget !== window){
    return __activeScrollTarget.scrollTop || 0;
  }
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

// Метрики для вычисления «близости к низу»
function getScrollMetrics(){
  // 1) Пытаемся использовать активную цель
  let t = __activeScrollTarget;
  if (!t || (t !== window && !(t.scrollHeight > t.clientHeight))) {
    // 2) Ищем лучший скроллер (с самым большим диапазоном)
    let best = null, bestRange = -1;
    for (const c of getScrollTargets()){
      let range = 0;
      if (c === window){
        const doc = document.documentElement || document.body;
        const sh = Math.max(doc.scrollHeight, document.body?.scrollHeight || 0);
        const ch = window.innerHeight || doc.clientHeight || 0;
        range = Math.max(0, sh - ch);
      } else if (c && c.scrollHeight > c.clientHeight){
        range = c.scrollHeight - c.clientHeight;
      }
      if (range > bestRange){ bestRange = range; best = c; }
    }
    t = best || window;
  }

  let y = 0, maxY = 0;
  if (t === window){
    y = window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
    const doc = document.documentElement || document.body;
    const sh = Math.max(doc.scrollHeight, document.body?.scrollHeight || 0);
    const ch = window.innerHeight || doc.clientHeight || 0;
    maxY = Math.max(0, sh - ch);
  } else {
    y = t.scrollTop || 0;
    maxY = Math.max(0, (t.scrollHeight || 0) - (t.clientHeight || 0));
  }

  const distToBottom = Math.max(0, maxY - y);
  return { target: t, y, maxY, distToBottom };
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
/**
 * threshold — насколько далеко от верха нужно уйти, чтобы кнопка Могла показываться.
 * bottomZone — «нижняя зона» (px до низа), в которой любое движение ВВЕРХ сразу показывает кнопку.
 */
export function mountScrollTop(threshold = 400, bottomZone = 400) {
  const btn = document.getElementById('scrollTopBtn');
  if (!btn) return;

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
    btn.style.display = 'none';
    __visible = false;
  };

  const show = () => {
    btn.removeAttribute('hidden');
    btn.removeAttribute('aria-hidden');
    btn.removeAttribute('inert');
    btn.style.removeProperty('display');
    __visible = true;
  };

  let __lastY = getScrollY();
  let __visible = false;

  // Порог для «заметного» направления, чтобы не дёргаться на микрошумы
  const DIR_EPS = 8;

  // Правило показа:
  //  - показываем только при движении ВВЕРХ;
  //  - и если пользователь либо достаточно далеко от верха (y > threshold),
  //    либо находится в нижней зоне (distToBottom <= bottomZone).
  function decideOnScroll() {
    if (!isHome()) { hide(); __lastY = getScrollY(); return; }

    const { y, distToBottom } = getScrollMetrics();
    const dy = y - __lastY;
    const goingUp   = dy < -DIR_EPS;
    const goingDown = dy >  DIR_EPS;

    const farFromTop = y > threshold;
    const inBottom   = distToBottom <= bottomZone;

    if (goingUp && (farFromTop || inBottom)) {
      if (!__visible) show();
    } else if (goingDown || !farFromTop) {
      if (__visible) hide();
    }
    __lastY = y;
  }

  // update() из поллера/форса — только «поддерживающее»:
  // сам по себе он не включает кнопку (это делает жест «скролл вверх»),
  // но может скрыть её, если пользователь снова приблизился к верху.
  const update = () => {
    if (!isHome()) { hide(); return; }
    const { y } = getScrollMetrics();
    if (y <= threshold && __visible) hide();
  };

  // Клик
  btn.addEventListener('click', () => {
    try { document.activeElement?.blur?.(); } catch {}
    scrollToTop();
  });

  btn.addEventListener('__force_update__', () => update());

  /* -------- биндинг скроллов + безопасный ребиндинг при hashchange -------- */
  let targets = [];
  let unbinds = [];
  const onScroll = () => decideOnScroll();
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
        t.addEventListener('resize', onResize);
      }
    }
    // Инициализация
    __lastY = getScrollY();
    update();
  }

  hide();
  bindAll();

  const onHash = () => {
    hide();
    unbindAll();
    setTimeout(() => { bindAll(); }, 0);
  };
  window.addEventListener('hashchange', onHash);

  // ПОЛЛЕР (на экзотических кейсах скрывает кнопку у верха)
  const POLL_MS = 250;
  const pollId = setInterval(update, POLL_MS);

  return () => {
    clearInterval(pollId);
    window.removeEventListener('hashchange', onHash);
    unbindAll();
    try { delete btn.dataset.bound; } catch {}
    hide();
  };
}
