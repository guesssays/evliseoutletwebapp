// src/core/botNotify.js
// Клиентский модуль, который пингует serverless-функцию
// + маркетинговые напоминания (корзина/избранное)
// Теперь пробрасываем shortId, чтобы бот показывал короткий номер.
// ИСКЛЮЧЕНО: фолбэк на свой chat_id для заказных типов (чтобы админам не сыпались уведомления).

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

/* Типы событий, привязанные к конкретным заказам — для них нельзя фолбэкать chat_id */
const ORDER_ONLY_TYPES = new Set([
  'orderPlaced',
  'orderAccepted',
  'statusChanged',
  'orderCanceled',
]);

/** Выбирает финальный chat_id: приоритет — явно переданный; иначе (кроме заказных типов) — из текущего WebApp */
function resolveTargetChatIdFor(type, preferredChatId) {
  const pref = String(preferredChatId || '');
  if (isValidChatId(pref)) return pref;

  // Для заказных типов НЕ используем фолбэк на свой chat_id,
  // иначе админы начнут получать пользовательские уведомления.
  if (ORDER_ONLY_TYPES.has(type)) return null;

  const fromWebApp = getTelegramChatId();
  return isValidChatId(fromWebApp || '') ? fromWebApp : null;
}

/** Базовый отправитель события в бота (через Netlify Function) */
async function sendToBot(type, { orderId, shortId, chatId, title, text } = {}, { requireUserChat=false } = {}) {
  const chat_id = resolveTargetChatIdFor(type, chatId);

  if (requireUserChat && !chat_id) return;         // маркетинг — только реальному пользователю
  if (ORDER_ONLY_TYPES.has(type) && !chat_id) return; // заказные типы без chat_id — не шлём

  const payload = { type };
  if (orderId) payload.orderId = String(orderId);
  if (shortId) payload.shortId = String(shortId);
  if (chat_id) payload.chat_id = chat_id;
  if (title)  payload.title   = String(title).slice(0, 140);
  if (text)   payload.text    = String(text).slice(0, 400);

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
export const notifyOrderPlaced   = (chatId, { orderId, shortId, title } = {}) =>
  sendToBot('orderPlaced',   { orderId, shortId, chatId, title });

export const notifyOrderAccepted = (chatId, { orderId, shortId, title } = {}) =>
  sendToBot('orderAccepted', { orderId, shortId, chatId, title });

export const notifyStatusChanged = (chatId, { orderId, shortId, title } = {}) =>
  sendToBot('statusChanged', { orderId, shortId, chatId, title });

export const notifyOrderCanceled = (chatId, { orderId, shortId, title } = {}) =>
  sendToBot('orderCanceled', { orderId, shortId, chatId, title });

/* Маркетинговые напоминания */
export const notifyCartReminder = (chatId, { text } = {}) =>
  sendToBot('cartReminder', { chatId, text }, { requireUserChat: true });

export const notifyFavoritesReminder = (chatId, { text } = {}) =>
  sendToBot('favReminder', { chatId, text }, { requireUserChat: true });

/* Рефералы / Кэшбек */
export const notifyReferralJoined = (inviterChatId, { text } = {}) =>
  sendToBot('referralJoined', { chatId: inviterChatId, text }, { requireUserChat: true });

export const notifyReferralOrderCashback = (inviterChatId, { text } = {}) =>
  sendToBot('referralOrderCashback', { chatId: inviterChatId, text }, { requireUserChat: true });

export const notifyCashbackMatured = (chatId, { text } = {}) =>
  sendToBot('cashbackMatured', { chatId, text }, { requireUserChat: true });
