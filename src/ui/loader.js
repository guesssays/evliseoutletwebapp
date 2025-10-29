// src/ui/loader.js
// Глобальный лоадер: стеклянный, с «орбитой» и умным показом.
// — отложенный показ (delay), минимальная длительность (min)
// — рефкаунтер (много параллельных операций)
// — мягкая анимация появления коробки
// — "snooze" чтобы подавить вспышки на быстрых экранах (например Product)
// — пресеты: pageTransition(), blocking()
// — прогресс (опционально): setProgress(0..1), resetProgress()

export const Loader = (() => {
  let $root = null;
  let $text = null;
  let $ring = null;
  let $progress = null;
  let counter = 0;
  let showTimer = null;
  let lastShowAt = 0;
  let snoozedUntil = 0;

  // Базовые значения (можно менять через configure)
  let CFG = {
    DELAY_MS: 260,  // показывать только если дольше 260мс
    MIN_MS:   600,  // минимум держать 600мс
  };

  function configure(opts = {}) {
    if (typeof opts.DELAY_MS === 'number') CFG.DELAY_MS = Math.max(0, opts.DELAY_MS);
    if (typeof opts.MIN_MS   === 'number') CFG.MIN_MS   = Math.max(0, opts.MIN_MS);
  }

  function ensureDom() {
    if ($root) return;

    $root = document.createElement('div');
    $root.id = 'globalLoader';
    $root.setAttribute('aria-live', 'polite');
    $root.setAttribute('hidden', '');

    $root.innerHTML = `
      <div class="gl__backdrop"></div>
      <div class="gl__box" role="status" aria-label="Загрузка">
        <div class="gl__spinner" aria-hidden="true">
          <div class="gl__ring"></div>
          <div class="gl__orbit">
            <span class="dot d1"></span>
            <span class="dot d2"></span>
            <span class="dot d3"></span>
          </div>
        </div>
        <div class="gl__bar" aria-hidden="true"><b style="width:0%"></b></div>
        <div class="gl__text" id="glText">Загружаем…</div>
      </div>
    `;
    document.body.appendChild($root);
    $text = $root.querySelector('#glText');
    $ring = $root.querySelector('.gl__ring');
    $progress = $root.querySelector('.gl__bar > b');
  }

  function _visible() {
    return $root && !$root.hasAttribute('hidden') && $root.classList.contains('is-visible');
  }

  function _applyProgress(value) {
    if (!$progress) return;
    if (value == null || isNaN(value)) {
      $root?.classList.remove('has-progress');
      $progress.style.width = '0%';
      return;
    }
    const v = Math.max(0, Math.min(1, value));
    $root?.classList.add('has-progress');
    $progress.style.width = (v * 100).toFixed(1) + '%';
  }

  function setProgress(value) {
    ensureDom();
    _applyProgress(value);
  }

  function resetProgress() {
    setProgress(undefined);
  }

  function reallyShow(compact = false) {
    ensureDom();

    // не показываем, пока действует «тишина»
    if (Date.now() < snoozedUntil) {
      return;
    }

    if (compact) $root.classList.add('gl--compact');
    else $root.classList.remove('gl--compact');

    $root.removeAttribute('hidden');
    $root.classList.add('is-visible');
    lastShowAt = Date.now();
  }

  function reallyHide() {
    if (!$root) return;
    $root.classList.remove('is-visible');
    $root.setAttribute('hidden', '');
    // при скрытии сбрасываем прогресс на всякий
    resetProgress();
  }

  function show(message, opts = {}) {
    // opts: { force, delay, min, compact }
    ensureDom();
    const force   = !!opts.force;
    const delayMs = typeof opts.delay === 'number' ? Math.max(0, opts.delay) : CFG.DELAY_MS;
    const compact = !!opts.compact;

    if (message) setText(message);

    counter++;

    // Если уже виден — не трогаем таймеры
    if (_visible()) return;

    clearTimeout(showTimer);

    if (force) {
      reallyShow(compact);
      return;
    }

    showTimer = setTimeout(() => {
      // при срабатывании таймера могли уже скрыть — проверим счётчик
      if (counter > 0) {
        reallyShow(compact);
      }
    }, delayMs);
  }

  function hide(opts = {}) {
    // opts: { min }
    const minMs = typeof opts.min === 'number' ? Math.max(0, opts.min) : CFG.MIN_MS;

    if (counter > 0) counter--;
    if (counter > 0) return; // ещё есть активные операции

    clearTimeout(showTimer);

    const elapsed = Date.now() - lastShowAt;
    if (_visible() && elapsed < minMs) {
      setTimeout(reallyHide, minMs - elapsed);
    } else {
      reallyHide();
    }
  }

  async function wrap(promiseOrFn, message, opts = {}) {
    show(message, opts);
    try {
      const p = (typeof promiseOrFn === 'function') ? promiseOrFn() : promiseOrFn;
      return await p;
    } finally {
      hide(opts);
    }
  }

  function setText(message = '') {
    ensureDom();
    try { $text.textContent = String(message || 'Загружаем…'); } catch {}
  }

  // Временная «тишина»: подавляем показ лоадера, чтобы избежать вспышки
  function snooze(ms = 800) {
    snoozedUntil = Date.now() + Math.max(0, ms);
  }

  // «бережный» переход между страницами — обычно достаточно snooze без спиннера
  function pageTransition(message = 'Переход…', opts = {}) {
    // здесь мы не форсим показ: просто ставим snooze и даём удобные start/done
    const compact = opts.compact ?? true;
    const delay   = opts.delay ?? CFG.DELAY_MS;
    const min     = opts.min ?? CFG.MIN_MS;

    return {
      // мягкий вариант: при start() — только отложенный показ, плюс snooze
      start() {
        snooze(700);
        show(message, { delay, compact });
      },
      done() { hide({ min }); },
      async run(fn) {
        snooze(700);
        return wrap(fn, message, { delay, min, compact });
      },
    };
  }

  // «жёсткий» режим — для оформления заказа/долгих запросов
  function blocking(message = 'Оформляем заказ…', opts = {}) {
    const compact = opts.compact ?? false;
    const min     = opts.min ?? Math.max(CFG.MIN_MS, 900);
    return {
      start() { show(message, { force: true, delay: 0, compact }); },
      done()  { hide({ min }); },
      async run(fn) { return wrap(fn, message, { force: true, delay: 0, min, compact }); },
      setProgress, resetProgress,
    };
  }

  return {
    show, hide, wrap, setText,
    setProgress, resetProgress,
    pageTransition, blocking,
    snooze, configure,
  };
})();
