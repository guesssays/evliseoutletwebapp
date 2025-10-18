// src/core/botNotify.js
//
// Лёгкий клиент для отправки коротких уведомлений в Telegram-бота.
// Требуется серверная ручка, которая по userId (Telegram ID) отправит сообщение через Bot API.
//
// Настройка:
//   1) Укажите URL эндпоинта в window.BOT_NOTIFY_URL (например, в index.html):
//        <script>window.BOT_NOTIFY_URL = '/api/bot-notify';</script>
//      Эндпоинт ожидает POST JSON: { userId: number, text: string }.
//   2) (Опционально) window.BOT_DEEPLINK = 'https://t.me/<bot_username>?startapp=notifications'
//
// Защита от дубликатов меж вкладок: oncePerEvent() даёт TTL-замок в localStorage.
//

const ENDPOINT = typeof window !== 'undefined' ? (window.BOT_NOTIFY_URL || '/api/bot-notify') : '/api/bot-notify';
const DEEPLINK = typeof window !== 'undefined' ? (window.BOT_DEEPLINK || '') : '';
const GENERIC_TEXT = 'У вас новое уведомление в EVLISE OUTLET. Откройте приложение, чтобы посмотреть.';

function oncePerEvent(key, ttlMs = 30_000){
  try{
    const k = `nas_botnotify_lock__${key}`;
    const raw = localStorage.getItem(k);
    const now = Date.now();
    if (raw){
      const ts = Number(raw)||0;
      if (now - ts < ttlMs) return false; // ещё «захвачено»
    }
    localStorage.setItem(k, String(now));
    return true;
  }catch{
    return true; // если localStorage недоступен — не блокируем
  }
}

async function sendToBot(userId, text, eventKey){
  // отсылаем только телеграм-пользователям (числовой id). Анонимы (anon_*) — пропуск.
  if (!userId || isNaN(Number(userId))) return;
  if (!ENDPOINT) return;
  if (!oncePerEvent(eventKey, 30_000)) return;

  const payload = {
    userId: Number(userId),
    text: (text || GENERIC_TEXT) + (DEEPLINK ? `\n${DEEPLINK}` : '')
  };

  try{
    await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type':'application/json' },
      body: JSON.stringify(payload),
      // не ждём ответа, но пусть ошибки не падают в консоль
      keepalive: true,
      credentials: 'omit'
    });
  }catch{/* no-op */}
}

/* ==== Публичные хелперы (все — без деталей события) ==== */

export function notifyOrderPlaced(userId, { orderId } = {}){
  return sendToBot(userId, GENERIC_TEXT, `placed_${orderId||'x'}`);
}
export function notifyOrderAccepted(userId, { orderId } = {}){
  return sendToBot(userId, GENERIC_TEXT, `accepted_${orderId||'x'}`);
}
export function notifyStatusChanged(userId, { orderId, status } = {}){
  return sendToBot(userId, GENERIC_TEXT, `status_${orderId||'x'}_${status||'x'}`);
}
export function notifyOrderCanceled(userId, { orderId } = {}){
  return sendToBot(userId, GENERIC_TEXT, `canceled_${orderId||'x'}`);
}
