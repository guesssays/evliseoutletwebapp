// src/ui/icons-patch.js
// Делает ВСЕ существующие вызовы lucide.createIcons() безопасными:
// - дебаунс: не чаще одного раза в тик для одного root
// - requestIdleCallback/timeout: не блокируем главный поток
// - скоуп: если передан контейнер, инициализируем только его
// - быстрый no-op, если в скоупе нет <i data-lucide>
// - даёт удобный хелпер window.initIcons(root)

(function patchLucide() {
  const g = typeof window !== 'undefined' ? window : globalThis;
  if (!g) return;

  // если lucide загрузится позже (через CDN defer), подождём
  const tryPatch = () => {
    const L = g.lucide;
    if (!L || typeof L.createIcons !== 'function') return false;
    if (L.__patchedCreateIcons) return true;

    const orig = L.createIcons.bind(L);
    const pending = new WeakSet();

    function hasIconsInScope(scope) {
      try {
        const node = scope && scope.querySelector ? scope : document;
        return !!node.querySelector('i[data-lucide]');
      } catch { return true; } // в сомнительных случаях лучше дернуть
    }

    function scheduleExec(args) {
      const nodeArg = args?.[1];
      const scope = (nodeArg && nodeArg.querySelector) ? nodeArg : document;
      if (pending.has(scope)) return;
      if (!hasIconsInScope(scope)) return;

      pending.add(scope);
      const run = () => {
        try { orig(...args); } catch {}
        pending.delete(scope);
      };

      if ('requestIdleCallback' in g) {
        g.requestIdleCallback(run, { timeout: 300 });
      } else {
        setTimeout(run, 0);
      }
    }

    // Подменяем createIcons на «ленивую» версию, сохраняем сигнатуру
    L.createIcons = function patchedCreateIcons(...args) {
      // поддерживаем все варианты вызова (без аргументов/с attrs/с root вторым аргументом)
      scheduleExec(args);
    };
    L.__patchedCreateIcons = true;

    // Удобный хелпер для точечного запуска по контейнеру
    g.initIcons = function initIcons(root = document) {
      try { L.createIcons({ attrs: { width: 18, height: 18 } }, root); } catch {}
    };

    // Лёгкий MutationObserver: обновляем только когда реально добавили <i data-lucide>
    try {
      const mo = new MutationObserver((muts) => {
        for (const m of muts) {
          for (const n of m.addedNodes) {
            if (n && n.nodeType === 1) {
              if (n.matches?.('i[data-lucide]') || n.querySelector?.('i[data-lucide]')) {
                // дергаем только для конкретного поддерева
                L.createIcons({}, n);
              }
            }
          }
        }
      });
      mo.observe(document.documentElement, { childList: true, subtree: true });
      L.__iconsObserver = mo;
    } catch {}

    // Маленькая оптимизация: если на странице уже есть иконки — инициализируем их «в фоне»
    try { L.createIcons(); } catch {}

    return true;
  };

  // Пытаемся сразу; если lucide ещё не готов — несколько ретраев
  if (!tryPatch()) {
    let tries = 0;
    const t = setInterval(() => {
      tries++;
      if (tryPatch() || tries > 40) clearInterval(t); // ~2s максимум
    }, 50);
  }
})();
