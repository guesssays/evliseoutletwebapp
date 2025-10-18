// src/core/botNotify.js

// Клиентский модуль, который пингует serverless-функцию
// Вызывается из app.js при событиях оформления/подтверждения/смены статуса/отмены

const ENDPOINT = '/.netlify/functions/notify';

/** Возвращает telegram user id, если WebApp открыт из бота */
export function getTelegramChatId() {
  const tg = window?.Telegram?.WebApp;
  const id = tg?.initDataUnsafe?.user?.id;
  return id ? String(id) : null;
}

/** Простейшая проверка chat_id на валидность (числовой Telegram ID) */
function isValidChatId(v) {
  return typeof v === 'string' && /^\d+$/.test(v);
}

/** Выбирает финальный chat_id: приоритет — явно переданный; иначе — из текущего WebApp */
function resolveTargetChatId(preferredChatId) {
  if (isValidChatId(String(preferredChatId || ''))) return String(preferredChatId);
  const fromWebApp = getTelegramChatId();
  return isValidChatId(fromWebApp || '') ? fromWebApp : null;
}

/** Базовый отправитель события в бота (через Netlify Function)
 *  ВАЖНО: НЕ требуем chat_id на клиенте — сервер сам подставит ADMIN_CHAT_ID.
 */
async function sendToBot(type, { orderId, chatId, title } = {}) {
  const chat_id = resolveTargetChatId(chatId); // может быть null — это ok
  const payload = { type, orderId };
  if (chat_id) payload.chat_id = chat_id;
  if (title) payload.title = String(title).slice(0, 140);

  try {
    await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  } catch {
    // молча игнорируем, чтобы не ломать UX
  }
}

/* Публичные хелперы — первый аргумент: целевой chatId (опционально) */
export const notifyOrderPlaced   = (chatId, { orderId, title } = {}) => sendToBot('orderPlaced',   { orderId, chatId, title });
export const notifyOrderAccepted = (chatId, { orderId, title } = {}) => sendToBot('orderAccepted', { orderId, chatId, title });
export const notifyStatusChanged = (chatId, { orderId, title } = {}) => sendToBot('statusChanged', { orderId, chatId, title });
export const notifyOrderCanceled = (chatId, { orderId, title } = {}) => sendToBot('orderCanceled', { orderId, chatId, title });
