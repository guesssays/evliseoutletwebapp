// src/ui/loader.js
// Глобовый лоадер с реф-каунтером, отложенным показом и минимальной длительностью.

export const Loader = (() => {
  let $root = null;
  let $text = null;
  let counter = 0;
  let showTimer = null;
  let lastShowAt = 0;
  const DELAY_MS = 200;   // показывать спиннер только если операция > 200ms
  const MIN_MS   = 500;   // минимум держать спиннер видимым 500ms, чтобы не мигал

  function ensureDom(){
    if ($root) return;
    $root = document.createElement('div');
    $root.id = 'globalLoader';
    $root.setAttribute('aria-live','polite');
    $root.innerHTML = `
      <div class="gl__backdrop"></div>
      <div class="gl__box" role="status" aria-label="Загрузка">
        <div class="gl__spinner" aria-hidden="true">
          <svg viewBox="0 0 50 50"><circle cx="25" cy="25" r="20"/></svg>
        </div>
        <div class="gl__text" id="glText">Загружаем…</div>
      </div>
    `;
    document.body.appendChild($root);
    $text = $root.querySelector('#glText');
  }

  function reallyShow(){
    ensureDom();
    $root.removeAttribute('hidden');
    $root.classList.add('is-visible');
    lastShowAt = Date.now();
  }

  function reallyHide(){
    if (!$root) return;
    $root.classList.remove('is-visible');
    $root.setAttribute('hidden','');
  }

  function show(message){
    ensureDom();
    if (message) setText(message);
    counter++;
    // если уже видим — ничего не делаем
    if ($root && $root.classList.contains('is-visible')) return;

    clearTimeout(showTimer);
    showTimer = setTimeout(reallyShow, DELAY_MS);
  }

  function hide(){
    if (counter > 0) counter--;
    if (counter > 0) return; // ещё есть активные операции

    clearTimeout(showTimer);

    // уважаем минимальную длительность показа
    const elapsed = Date.now() - lastShowAt;
    if ($root && $root.classList.contains('is-visible') && elapsed < MIN_MS){
      setTimeout(reallyHide, MIN_MS - elapsed);
    } else {
      reallyHide();
    }
  }

  async function wrap(promiseOrFn, message){
    show(message);
    try{
      const p = (typeof promiseOrFn === 'function') ? promiseOrFn() : promiseOrFn;
      return await p;
    } finally{
      hide();
    }
  }

  function setText(message=''){
    ensureDom();
    try { $text.textContent = String(message||'Загружаем…'); } catch {}
  }

  // «страничный» переход: удобный алиас
  function pageTransition(message='Переход…'){
    return {
      start(){ show(message); },
      done(){ hide(); },
      async run(fn){ return wrap(fn, message); },
    };
  }

  return { show, hide, wrap, setText, pageTransition };
})();
