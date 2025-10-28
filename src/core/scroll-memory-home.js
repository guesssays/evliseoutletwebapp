// src/core/scroll-memory-home.js
// Память скролла для главной: сохраняем при уходе, восстанавливаем при возвращении.
// Работает с любым скролл-контейнером, ждёт рендер и картинки,
// не конфликтует с вашим ScrollReset (сам подавляет его на время восстановления).

/* ===== утилиты (совпадают по духу с ScrollTop.js) ===== */
function isHome() {
  const raw = String(location.hash || '');
  if (raw === '' || raw === '#') return true;

  let path = raw.slice(1);
  if (path.startsWith('?')) return true;
  if (path === '' || path === '/') return true;
  if (path.startsWith('/?')) return true;

  // если роутер уже отрисовал главную — будет грид
  if (document.getElementById('productGrid')) return true;

  path = path.split('?')[0].replace(/^\/+/, '');
  return path === '';
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

/* ===== ключ в sessionStorage (переживает переходы в рамках сессии) ===== */
const KEY = 'home:scrollY';

/* ===== публичный API ===== */
export const HomeScrollMemory = {
  /** Сохранить текущий скролл, если мы на главной. */
  saveIfHome() {
    if (!isHome()) return;
    const y = getScrollY();
    try { sessionStorage.setItem(KEY, String(Math.max(0, y|0))); } catch {}
  },

  /** Сбросить сохранённое (по желанию, обычно не нужно). */
  clear() {
    try { sessionStorage.removeItem(KEY); } catch {}
  },

  /** Восстановить скролл, если есть сохранённое значение. */
  async restoreIfHome() {
    if (!isHome()) return;
    let y = 0;
    try { y = Number(sessionStorage.getItem(KEY) || 0) || 0; } catch {}
    if (y <= 0) return;

    try { window.ScrollReset?.suppress?.(1000); window.ScrollReset?.quiet?.(1000); } catch {}

    await new Promise(r => requestAnimationFrame(r));
    const view = document.getElementById('view') || document.body;

    scrollToY(Math.max(0, y - 1));
    await afterImagesIn(view);

    scrollToY(y);
    await new Promise(r => requestAnimationFrame(r));
    scrollToY(y);

    // ⬇️ сигнал ScrollReset: мы всё, можно продолжать жить обычной жизнью
    try { window.__HOME_WILL_RESTORE__ = false; } catch {}
  },


  /** Инициализировать слушатели. Можно передать router, если он есть. */
  mount(router) {
    // 0) Клик-перехват: если кликаем по ссылке из главной — сохраняем ДО навигации
    document.addEventListener('click', (e)=>{
      const a = e.target.closest('a[href^="#/"]');
      if (!a) return;
      if (!isHome()) return;

      const href = String(a.getAttribute('href')||'');
      // навигация с главной на любой другой экран
      if (href !== '#/' && href !== '#') {
        this.saveIfHome();
      }
    }, { capture: true });

    // 1) Если есть роутер-эмиттер — используем его события (опционально)
    let usedRouter = false;
    try {
      if (router && typeof router.on === 'function') {
        usedRouter = true;
        router.on('before-navigate', () => { this.saveIfHome(); });
        window.addEventListener('view:home-mounted', () => { this.restoreIfHome(); });
        router.on('after-navigate', () => { this.restoreIfHome(); });
      }
    } catch {}

    // 2) Без роутера — надёжная стратегия через hashchange с памятью предыдущего состояния
    if (!usedRouter) {
      let lastIsHome = isHome();
      window.addEventListener('hashchange', () => {
        const wasHome = lastIsHome;
        const nowHome = isHome();
        if (wasHome && !nowHome) {
          // уходим с главной
          this.saveIfHome();
        } else if (!wasHome && nowHome) {
          // пришли на главную
          this.restoreIfHome();
        }
        lastIsHome = nowHome;
      });
    }

    // 3) Старт приложения: если мы уже на главной — попытаться восстановить
    setTimeout(() => this.restoreIfHome(), 0);

    // 4) Подстраховка на bfcache (Safari/iOS)
    window.addEventListener('pageshow', (e) => {
      if (e && e.persisted) {
        setTimeout(() => this.restoreIfHome(), 0);
      }
    });
  }
};
