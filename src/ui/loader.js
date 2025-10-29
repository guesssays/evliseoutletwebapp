// src/ui/loader.js
// Глобальный лоадер: стеклянный, с «орбитой» и умным показом.
// — отложенный показ (delay), минимальная длительность (min)
// — рефкаунтер (много параллельных операций)
// — мягкая анимация появления коробки
// — "snooze" чтобы подавить вспышки на быстрых экранах (например Product)
// — пресеты: pageTransition(), blocking()
// — прогресс (опционально): setProgress(0..1), resetProgress()
// — ⚡ flash-guard: защита от «мигания» при суперкоротких задачах
// — micro(): обёртка для микрозадач без показа спиннера

export const Loader = (() => {
  let $root = null;
  let $text = null;
  let $ring = null;
  let $progress = null;

  let counter = 0;          // активные операции
  let showTimer = null;     // таймер отложенного показа
  let lastShowAt = 0;       // когда реально показали
  let lastHideAt = 0;       // когда реально скрыли (для flash-guard)
  let snoozedUntil = 0;     // «тишина» до этого момента (мс от epoch)

  // Базовые значения (можно менять через configure)
  let CFG = {
    DELAY_MS:        380,   // показывать только если дольше 380мс (раньше было 260)
    MIN_MS:          520,   // минимум держать 520мс (раньше было 600; ощущается мягче)
    FLASH_GUARD_MS:  200,   // не показывать, если с момента hide прошло < 200мс
    SNOOZE_DEFAULT:  900,   // дефолтная «тишина» (страничные переходы)
  };

  function configure(opts = {}) {
    if (typeof opts.DELAY_MS === 'number')       CFG.DELAY_MS       = Math.max(0, opts.DELAY_MS);
    if (typeof opts.MIN_MS   === 'number')       CFG.MIN_MS         = Math.max(0, opts.MIN_MS);
    if (typeof opts.FLASH_GUARD_MS === 'number') CFG.FLASH_GUARD_MS = Math.max(0, opts.FLASH_GUARD_MS);
    if (typeof opts.SNOOZE_DEFAULT === 'number') CFG.SNOOZE_DEFAULT = Math.max(0, opts.SNOOZE_DEFAULT);
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

    const now = Date.now();

    // 1) не показываем, пока действует «тишина»
    if (now < snoozedUntil) return;

    // 2) flash-guard: если только что скрывали — не мигаем
    if (now - lastHideAt < CFG.FLASH_GUARD_MS) return;

    if (compact) $root.classList.add('gl--compact');
    else $root.classList.remove('gl--compact');

    $root.removeAttribute('hidden');
    $root.classList.add('is-visible');
    lastShowAt = now;
  }

  function reallyHide() {
    if (!$root) return;
    $root.classList.remove('is-visible');
    $root.setAttribute('hidden', '');
    lastHideAt = Date.now();
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

    // Отложенный показ
    const plannedAt = Date.now() + delayMs;
    showTimer = setTimeout(() => {
      // Пока ждали — всё могло завершиться
      if (counter <= 0) return;
      // Если «тишина» ещё активна, не показываем (и не пересоздаём таймер — будет тихо)
      reallyShow(compact);
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
      setTimeout(reallyHide, Math.max(0, minMs - elapsed));
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
  function snooze(ms = CFG.SNOOZE_DEFAULT) {
    snoozedUntil = Date.now() + Math.max(0, ms);
  }

  // Публичный алиас если хочется явно подавить ближайшие микрозадачи
  function suppressFlash(ms = CFG.SNOOZE_DEFAULT) { snooze(ms); }

  // «бережный» переход между страницами — обычно достаточно snooze без спиннера
  function pageTransition(message = 'Переход…', opts = {}) {
    const compact = opts.compact ?? true;
    const delay   = opts.delay ?? CFG.DELAY_MS;
    const min     = opts.min ?? CFG.MIN_MS;

    return {
      // мягкий вариант: при start() — только отложенный показ, плюс snooze
      start() {
        snooze(CFG.SNOOZE_DEFAULT);
        show(message, { delay, compact });
      },
      done() { hide({ min }); },
      async run(fn) {
        snooze(CFG.SNOOZE_DEFAULT);
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

  // 🫧 Микро-обёртка: на время выполнения ставит snooze и НЕ показывает спиннер
  async function micro(fn, snoozeMs = 600) {
    snooze(snoozeMs);
    const res = await (typeof fn === 'function' ? fn() : fn);
    // небольшой дополнительный гвард от «эхо-вспышки»
    snooze(120);
    return res;
  }

  return {
    show, hide, wrap, setText,
    setProgress, resetProgress,
    pageTransition, blocking,
    snooze, suppressFlash, micro, configure,
  };
})();
