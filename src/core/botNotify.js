// Клиентский модуль, который умеет пинговать serverless-функцию
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

/** Базовый отправитель события в бота (через Netlify Function) */
async function sendToBot(type, { orderId, chatId } = {}) {
  const chat_id = resolveTargetChatId(chatId);
  if (!chat_id) {
    // Нет валидного получателя — тихо выходим (например, пользователь открыл сайт вне Telegram)
    return;
  }
  try {
    await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id, type, orderId })
    });
  } catch {
    // молча игнорируем, чтобы не ломать UX (при желании логируйте в Sentry)
  }
}

/* Публичные хелперы — первый аргумент: целевой chatId (опционально) */
export const notifyOrderPlaced   = (chatId, { orderId } = {}) => sendToBot('orderPlaced',   { orderId, chatId });
export const notifyOrderAccepted = (chatId, { orderId } = {}) => sendToBot('orderAccepted', { orderId, chatId });
export const notifyStatusChanged = (chatId, { orderId } = {}) => sendToBot('statusChanged', { orderId, chatId });
export const notifyOrderCanceled = (chatId, { orderId } = {}) => sendToBot('orderCanceled', { orderId, chatId });
