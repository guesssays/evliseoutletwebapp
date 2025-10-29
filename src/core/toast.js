// src/core/toast.js
let TOAST_ID = 0;

function ensureWrap() {
  let w = document.getElementById('toastWrap');
  if (!w) {
    w = document.createElement('div');
    w.id = 'toastWrap';
    w.className = 'toast-wrap';
    w.setAttribute('aria-live', 'polite');
    w.setAttribute('role', 'status');
    document.body.appendChild(w);
  }
  return w;
}

/**
 * Показывает тост "динамический остров".
 * @param {string} msg
 * @param {Object} [opts]
 * @param {'default'|'ok'|'warn'|'error'} [opts.variant='default']
 * @param {number} [opts.timeout=2400]  // мс
 * @param {string|null} [opts.icon]     // lucide-иконка, напр. 'check', 'alert-triangle'
 */
export function toast(msg, opts = {}) {
  const { variant = 'default', timeout = 2400, icon = null } = opts;

  const wrap = ensureWrap();
  const id = `t${++TOAST_ID}`;

  const n = document.createElement('div');
  n.id = id;
  n.className = `toast island ${variant}`;
  n.innerHTML = `
    ${icon ? `<i data-lucide="${icon}"></i>` : ''}
    <div class="t-body">${String(msg || '').trim()}</div>
  `.trim();

  wrap.appendChild(n);

  // анимация входа
  requestAnimationFrame(() => n.classList.add('show'));
  window.lucide?.createIcons?.();

  // auto-hide (+ пауза по hover/tap)
  let closed = false;
  let t = setTimeout(close, timeout);

  function close() {
    if (closed) return;
    closed = true;
    n.classList.remove('show');
    n.classList.add('hide');
    n.addEventListener('transitionend', () => n.remove(), { once: true });
  }

  // пауза на ховер
  n.addEventListener('mouseenter', () => clearTimeout(t));
  n.addEventListener('mouseleave', () => { if (!closed) t = setTimeout(close, 800); });

  // клик = закрыть
  n.addEventListener('click', close);

  // свайп-вверх для закрытия
  let startY = null;
  n.addEventListener('touchstart', (e) => {
    startY = e.touches?.[0]?.clientY ?? null;
    clearTimeout(t);
  }, { passive: true });

  n.addEventListener('touchmove', (e) => {
    if (startY == null) return;
    const y = e.touches?.[0]?.clientY ?? startY;
    const dy = Math.min(0, y - startY); // только вверх
    n.style.setProperty('--dy', `${dy}px`);
  }, { passive: true });

  n.addEventListener('touchend', () => {
    const dy = parseFloat(getComputedStyle(n).getPropertyValue('--dy') || '0');
    n.style.removeProperty('--dy');
    if (dy < -40) close();
    else if (!closed) t = setTimeout(close, 800);
    startY = null;
  }, { passive: true });

  return id;
}
