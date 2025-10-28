// src/components/ScrollTop.js
// Кнопка «Наверх»: корректная доступность и синхронизация hidden/aria-hidden/inert
// + поддержка скролла не только у window

function getScrollContainerCandidates(){
  const list = [];
  if (document.scrollingElement) list.push(document.scrollingElement);
  const view = document.getElementById('view');
  if (view) list.push(view);
  const app = document.getElementById('app');
  if (app) list.push(app);
  list.push(window);
  return Array.from(new Set(list));
}
function getScrollY(){
  const cands = getScrollContainerCandidates();
  for (const c of cands){
    if (c === window){
      const y = window.scrollY || document.documentElement.scrollTop || 0;
      if (y) return y;
    } else {
      if (c.scrollHeight > c.clientHeight) return c.scrollTop || 0;
    }
  }
  return window.scrollY || document.documentElement.scrollTop || 0;
}
function scrollToTop(){
  // скроллим и window, и контейнеры — кто “главный”, тот дернется
  const cands = getScrollContainerCandidates();
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
    try { document.documentElement.scrollTo({ top:0, behavior:'smooth' }); } catch {}
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

  // слушаем все возможные скролл-контейнеры
  const targets = getScrollContainerCandidates();
  for (const t of targets){
    if (t === window){
      window.addEventListener('scroll', update, { passive: true });
      window.addEventListener('resize', update);
    } else {
      t.addEventListener('scroll', update, { passive: true });
      t.addEventListener('resize', update);
    }
  }
  window.addEventListener('hashchange', () => setTimeout(update, 0));

  hide();
  setTimeout(update, 0);
}
