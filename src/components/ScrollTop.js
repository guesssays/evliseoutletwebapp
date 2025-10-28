// src/components/ScrollTop.js
// Кнопка «Наверх»: появляется ТОЛЬКО на главной (#/), корректная доступность,
// живые обработчики без одноразовости, поддержка внутренних скролл-контейнеров,
// безопасный ребиндинг при hashchange.

/* ================== ВСПОМОГАТЕЛЬНОЕ: ОПРЕДЕЛЕНИЕ ГЛАВНОЙ ================== */
/**
 * Возвращает true, если мы на главной:
 *  - '', '#', '#/', '#/?...' и даже '#?utm=...'
 */
function isHome() {
  const raw = String(location.hash || '');
  if (raw === '' || raw === '#') return true;

  // убираем ведущий '#'
  let path = raw.slice(1); // например '/?utm=...' | '/' | '?a=1' | 'product/123'
  if (path.startsWith('?')) return true;     // '#?utm=...'
  if (path === '' || path === '/') return true;
  if (path.startsWith('/?')) return true;    // '#/?utm=...'

  // отрезаем query и ведущие слэши
  path = path.split('?')[0].replace(/^\/+/, ''); // 'product/123' | '' (главная)
  return path === '';
}

/* ============== ПОИСК СКРОЛЛ-КОНТЕЙНЕРА(ОВ) И ТЕКУЩЕГО СКРОЛЛА ============== */
function classicCandidates() {
  const arr = [];
  if (document.scrollingElement) arr.push(document.scrollingElement);
  const view = document.getElementById('view'); if (view) arr.push(view);
  const app  = document.getElementById('app');  if (app)  arr.push(app);
  arr.push(window);
  return arr;
}

let __activeScrollTarget = null;

/** Находим любой «живой» скролл-элемент в DOM (страховка под кастомные layout’ы). */
function findAnyScrollable() {
  const all = Array.from(document.querySelectorAll('body, body *'));
  for (const el of all) {
    try {
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none') continue;
      const oy = cs.overflowY;
      if ((oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight) {
        return el;
      }
    } catch {}
  }
  return null;
}

function getScrollTargets() {
  const out = new Set();
  if (__activeScrollTarget) out.add(__activeScrollTarget);
  for (const c of classicCandidates()) out.add(c);
  const auto = findAnyScrollable();
  if (auto) out.add(auto);
  return Array.from(out);
}

function getScrollY() {
  if (__activeScrollTarget && __activeScrollTarget !== window) {
    return __activeScrollTarget.scrollTop || 0;
  }
  const cands = getScrollTargets();
  for (const c of cands) {
    if (c === window) {
      const y = window.scrollY || document.documentElement.scrollTop || 0;
      if (y) return y;
    } else if (c && c.scrollHeight > c.clientHeight) {
      const y = c.scrollTop || 0;
      if (y) return y;
    }
  }
  return 0;
}

function bindActiveTargetDetector(node) {
  const onWheel = (e) => { __activeScrollTarget = e.currentTarget; };
  const onTouch = (e) => { __activeScrollTarget = e.currentTarget; };
  node.addEventListener('wheel', onWheel, { passive: true });
  node.addEventListener('touchmove', onTouch, { passive: true });
  return () => {
    node.removeEventListener('wheel', onWheel);
    node.removeEventListener('touchmove', onTouch);
  };
}

/* ========================= ПРОКРУТКА К ВЕРХУ (SMOOTH) ====================== */
function scrollToTop() {
  const cands = getScrollTargets();
  let did = false;
  for (const c of cands) {
    if (c === window) {
      window.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
      did = true;
    } else if (c.scrollHeight > c.clientHeight) {
      c.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
      did = true;
    }
  }
  if (!did) {
    try { (document.documentElement || document.body).scrollTo({ top: 0, behavior: 'smooth' }); } catch {}
  }
}

/* =============================== ПУБЛИЧНЫЙ API ============================== */
export function mountScrollTop(threshold = 400) {
  const btn = document.getElementById('scrollTopBtn');
  if (!btn) return;

  // защита от повторной инициализации
  if (btn.dataset.bound === '1') {
    // При повторном вызове просто принудительно пересчитаем состояние
    try { btn.dispatchEvent(new Event('__force_update__')); } catch {}
    return;
  }
  btn.dataset.bound = '1';

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

  // Клик — живой обработчик
  btn.addEventListener('click', () => {
    try { document.activeElement?.blur?.(); } catch {}
    scrollToTop();
  });

  // Локальный «служебный» ивент для форс-апдейта (см. защита выше)
  btn.addEventListener('__force_update__', () => update());

  // --- Биндинг и ребиндинг слушателей скролла ---
  let targets = [];
  let unbinds = [];
  const onScroll = () => update();
  const onResize = () => update();

  function unbindAll() {
    for (const t of targets) {
      if (t === window) {
        window.removeEventListener('scroll', onScroll);
        window.removeEventListener('resize', onResize);
      } else {
        t.removeEventListener('scroll', onScroll);
        t.removeEventListener('resize', onResize);
      }
    }
    targets = [];
    unbinds.forEach(fn => { try { fn(); } catch {} });
    unbinds = [];
  }

  function bindAll() {
    targets = getScrollTargets();
    for (const t of targets) {
      unbinds.push(bindActiveTargetDetector(t));
      if (t === window) {
        window.addEventListener('scroll', onScroll, { passive: true });
        window.addEventListener('resize', onResize);
      } else {
        t.addEventListener('scroll', onScroll, { passive: true });
        // не все элементы шлют resize, но это безопасно
        t.addEventListener('resize', onResize);
      }
    }
    update(); // моментальный пересчёт
  }

  // первая инициализация
  hide();
  bindAll();

  // Перебинд при смене маршрута (DOM/контейнер мог измениться)
  const onHash = () => {
    hide();         // мгновенно спрятать (если ушли с главной)
    unbindAll();    // отписаться от старых
    setTimeout(() => { bindAll(); }, 0); // next-tick — уже с новым DOM
  };
  window.addEventListener('hashchange', onHash);

  // Вернуть функцию полного размонтажа (на будущее)
  return () => {
    window.removeEventListener('hashchange', onHash);
    unbindAll();
    try { delete btn.dataset.bound; } catch {}
    hide();
  };
}
