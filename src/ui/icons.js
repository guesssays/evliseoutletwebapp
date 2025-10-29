// src/ui/icons.js
// Историческая обёртка. Оставляем её, чтобы не менять импорты по проекту.
// Теперь она делегирует на window.initIcons (из icons-patch.js),
// а если патч ещё не применился — вызывает lucide.createIcons напрямую.

export function initIconsScoped(root = document) {
  const run = () => {
    try {
      if (typeof window.initIcons === 'function') {
        // новый быстрый путь: скоуп + дебаунс внутри патча
        window.initIcons(root);
      } else if (window.lucide?.createIcons) {
        // запасной путь: прямой вызов lucide
        window.lucide.createIcons({ attrs: { width: 18, height: 18 } }, root);
      }
    } catch {}
  };

  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(run, { timeout: 300 });
  } else {
    setTimeout(run, 0);
  }
}

export default { initIconsScoped };
