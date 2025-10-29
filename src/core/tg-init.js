// src/core/tg-init.js
// Единая и безопасная работа с Telegram WebApp initData:
// - initTelegram() — вызвать один раз при старте приложения.
// - getInitDataRaw() / getInitDataB64() — "сырая" строка и её base64-версия.
// - getBotUsername() — @username бота, если доступен.
// - getInitHeaders(extra) — стандартные заголовки для fetch к функциям.
// - isInsideTelegram() — детект, запущено ли приложение внутри Telegram.
// - whenReady() — промис, который резолвится после инициализации TG.

const _state = {
  started: false,
  ready: false,
  botUsername: null, // без @
  initDataRaw: '',
  isTg: false
};

function _readFromTG() {
  try {
    const tg = window?.Telegram?.WebApp || null;
    if (!tg) return { isTg: false, initDataRaw: '', botUsername: null };

    const initDataRaw = typeof tg.initData === 'string' ? tg.initData : '';
    // bot username можем достать из initData (field: 'bot', 'query_id'), но проще из initDataUnsafe
    let botUsername = null;
    try {
      const unsafe = tg.initDataUnsafe || {};
      // Telegram часто кладёт username без @
      if (unsafe?.bot?.username) botUsername = String(unsafe.bot.username).replace(/^@/, '');
      // fallback через параметр в initData ?tgWebAppVersion=...&... — не всегда есть; игнорируем.
    } catch {}

    return {
      isTg: true,
      initDataRaw,
      botUsername: botUsername || null
    };
  } catch {
    return { isTg: false, initDataRaw: '', botUsername: null };
  }
}

function _loadFromSession() {
  try {
    const obj = JSON.parse(sessionStorage.getItem('__tg_init_cache__') || 'null');
    if (!obj || typeof obj !== 'object') return null;
    return obj;
  } catch { return null; }
}

function _saveToSession(obj) {
  try { sessionStorage.setItem('__tg_init_cache__', JSON.stringify(obj || {})); } catch {}
}

let _readyResolve;
const _readyPromise = new Promise(res => { _readyResolve = res; });

export function isInsideTelegram() {
  return !!_state.isTg;
}

/**
 * Инициализация. Зовём РАНО (например, в main.js перед роутером).
 * Можно передать ожидаемое имя бота (без "@") чтобы логировать рассинхрон.
 */
export function initTelegram({ expectedBot = null } = {}) {
  if (_state.started) return;
  _state.started = true;

  // 1) кеш из сессии, чтобы не мигало при горячей перезагрузке
  const cached = _loadFromSession();
  if (cached && typeof cached === 'object') {
    _state.isTg = !!cached.isTg;
    _state.initDataRaw = String(cached.initDataRaw || '');
    _state.botUsername = cached.botUsername ? String(cached.botUsername).replace(/^@/, '') : null;
  }

  // 2) попытка прочитать напрямую из WebApp
  const fromTg = _readFromTG();
  if (fromTg.isTg) {
    _state.isTg = true;
    if (fromTg.initDataRaw) _state.initDataRaw = fromTg.initDataRaw;
    if (fromTg.botUsername) _state.botUsername = fromTg.botUsername.replace(/^@/, '');
  }

  // 3) сохранить кеш
  _saveToSession({ isTg: _state.isTg, initDataRaw: _state.initDataRaw, botUsername: _state.botUsername });

  // 4) мягкая диагностика несовпадения бота
  if (expectedBot && _state.botUsername && _state.botUsername !== expectedBot) {
    // только лог, без блокировок
    console.warn('[tg-init] bot username mismatch:',
      { expected: expectedBot, got: _state.botUsername });
  }

  _state.ready = true;
  if (_readyResolve) _readyResolve(true);
}

export function whenReady() {
  return _state.ready ? Promise.resolve(true) : _readyPromise;
}

export function getInitDataRaw() {
  return String(_state.initDataRaw || '');
}

export function getInitDataB64() {
  const raw = getInitDataRaw();
  if (!raw) return '';
  try {
    // важно: raw может содержать non-ASCII; кодируем безопасно
    return btoa(unescape(encodeURIComponent(raw)));
  } catch {
    try { return btoa(raw); } catch { return ''; }
  }
}

export function getBotUsername() {
  return _state.botUsername ? String(_state.botUsername).replace(/^@/, '') : '';
}

/**
 * Унифицированные заголовки для запросов на бэкенд-функции.
 * По умолчанию вернёт:
 *  - 'Cache-Control': 'no-store'
 *  - 'X-Tg-Init-Data': <raw initData> (если есть)
 *  - 'X-Bot-Username': <bot username>  (если есть)
 * Любые extra будут смержены поверх.
 */
export function getInitHeaders(extra = {}) {
  const h = { 'Cache-Control': 'no-store' };
  const raw = getInitDataRaw();
  if (raw) h['X-Tg-Init-Data'] = raw;
  const bot = getBotUsername();
  if (bot) h['X-Bot-Username'] = bot;
  return Object.assign(h, extra || {});
}

/**
 * Простой helper для fetch: подмешивает init-заголовки.
 */
export function fetchWithInit(input, init = {}) {
  const headers = getInitHeaders(init.headers || {});
  return fetch(input, { ...init, headers });
}

// Для удобства отладки
try {
  window.TG_INIT = {
    get state() { return { ..._state }; },
    initTelegram,
    getInitHeaders,
    getInitDataRaw,
    getInitDataB64,
    getBotUsername,
    isInsideTelegram
  };
} catch {}
