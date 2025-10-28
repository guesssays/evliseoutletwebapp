// src/core/scroll-memory-home.js
// Память скролла главной

/* ===== утилиты ===== */
function isHome() {
  // Главная только когда хэш пустой, '#', '#/', или '#/?...'
  const raw = String(location.hash || '');
  if (raw === '' || raw === '#') return true;

  let path = raw.slice(1);          // убираем '#'
  const [pure, query=''] = path.split('?');
  const clean = String(pure || '').replace(/^\/+/, ''); // срезаем ведущие '/'

  // пустой путь ('' или '/'), любые query поверх корня — считаем главной
  if (clean === '' && (query === '' || query.length >= 0)) return true;

  return false;
}

function classicCandidates(){
  const arr = [];
  if (document.scrollingElement) arr.push(document.scrollingElement);
  const view = document.getElementById('view'); if (view) arr.push(view);
  const app  = document.getElementById('app');  if (app)  arr.push(app);
  arr.push(window);
  return arr;
}

function getScrollTargets(){
  const out = new Set(classicCandidates());
  return Array.from(out);
}

function getScrollY(){
  let maxY = 0;
  for (const c of getScrollTargets()){
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

function scrollToY(y){
  for (const c of getScrollTargets()){
    if (c === window){
      try { window.scrollTo({ top: y, behavior: 'auto' }); } catch {}
    } else if (c && c.scrollHeight > c.clientHeight){
      try { c.scrollTo({ top: y, behavior: 'auto' }); } catch {}
    }
  }
}

function afterImagesIn(el) {
  if (!el) return Promise.resolve();
  const imgs = [...el.querySelectorAll('img')];
  const pending = imgs
    .filter(img => !img.complete || img.naturalWidth === 0)
    .map(img => new Promise(res => {
      const done = () => { img.removeEventListener('load', done); img.removeEventListener('error', done); res(); };
      img.addEventListener('load', done, { once: true });
      img.addEventListener('error', done, { once: true });
    }));
  return Promise.race([
    Promise.all(pending),
    new Promise(res => setTimeout(res, 350))
  ]);
}

const KEY = 'home:scrollY';

export const HomeScrollMemory = {
  saveIfHome() {
    if (!isHome()) return;
    const y = getScrollY();
    try { sessionStorage.setItem(KEY, String(Math.max(0, y|0))); } catch {}
  },

  clear() {
    try { sessionStorage.removeItem(KEY); } catch {}
  },

  async restoreIfHome() {
    // быстрая проверка маршрута
    if (!isHome()) return;

    let y = 0;
    try { y = Number(sessionStorage.getItem(KEY) || 0) || 0; } catch {}
    if (y <= 0) return;

    try {
      // блокируем любые внешние сбросы на время восстановления
      window.__HOME_WILL_RESTORE__ = true;
      window.ScrollReset?.quiet?.(1500);
      window.ScrollReset?.suppress?.(1500);
    } catch {}

    try {
      // дать DOM дорендериться
      await new Promise(r => requestAnimationFrame(r));

      // 🔁 повторно убеждаемся, что всё ещё на главной (могли успеть уйти)
      if (!isHome()) return;

      const view = document.getElementById('view') || document.body;

      // «подкачка» в область
      scrollToY(Math.max(0, y - 1));

      // ждём основные изображения (с таймаутом)
      await afterImagesIn(view);

      // двойной прострел позиции
      scrollToY(y);
      await new Promise(r => requestAnimationFrame(r));
      scrollToY(y);
    } finally {
      try { window.__HOME_WILL_RESTORE__ = false; } catch {}
    }
  },

  mount(router) {
    // перехват кликов: уходим с главной — сохраняем позицию ДО навигации
    document.addEventListener('click', (e)=>{
      const a = e.target.closest('a[href^="#/"]');
      if (!a) return;
      if (!isHome()) return;

      const href = String(a.getAttribute('href')||'');
      if (href !== '#/' && href !== '#') {
        this.saveIfHome();
      }
    }, { capture: true });

    let usedRouter = false;
    try {
      if (router && typeof router.on === 'function') {
        usedRouter = true;
        router.on('before-navigate', () => { this.saveIfHome(); });
        window.addEventListener('view:home-mounted', () => { this.restoreIfHome(); });
        router.on('after-navigate', () => { this.restoreIfHome(); });
      }
    } catch {}

    if (!usedRouter) {
      let lastIsHome = isHome();
      window.addEventListener('hashchange', () => {
        const wasHome = lastIsHome;
        const nowHome = isHome();
        if (wasHome && !nowHome) {
          this.saveIfHome();
        } else if (!wasHome && nowHome) {
          this.restoreIfHome();
        }
        lastIsHome = nowHome;
      });
    }

    setTimeout(() => this.restoreIfHome(), 0);

    window.addEventListener('pageshow', (e) => {
      if (e && e.persisted) {
        setTimeout(() => this.restoreIfHome(), 0);
      }
    });
  }
};
