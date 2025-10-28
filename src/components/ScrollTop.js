// Кнопка «Наверх»: корректная доступность и синхронизация hidden/aria-hidden/inert
// + поддержка скролла не только у window, но и у внутренних контейнеров

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
    const y = getScrollY();
    if (y > threshold) show(); else hide();
  };

  btn.addEventListener('click', () => {
    try { document.activeElement?.blur?.(); } catch {}
    scrollToTop();
  });

  // слушаем все возможные скролл-контейнеры + фиксируем активный
  const targets = getScrollTargets();
  const unbinds = [];
  for (const t of targets){
    unbinds.push(bindActiveTargetDetector(t));
    if (t === window){
      window.addEventListener('scroll', update, { passive: true });
      window.addEventListener('resize', update);
    } else {
      t.addEventListener('scroll', update, { passive: true });
      t.addEventListener('resize', update);
    }
  }

  window.addEventListener('hashchange', () => setTimeout(update, 0));

  // старт
  hide();
  setTimeout(update, 0);

  // (опционально) вернуть функцию для отписки, если когда-нибудь понадобится размонтировать
  return () => {
    for (const t of targets){
      if (t === window){
        window.removeEventListener('scroll', update);
        window.removeEventListener('resize', update);
      } else {
        t.removeEventListener('scroll', update);
        t.removeEventListener('resize', update);
      }
    }
    unbinds.forEach(fn=>{ try{ fn(); }catch{} });
  };
}
