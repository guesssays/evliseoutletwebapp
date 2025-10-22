// src/core/botNotify.js
// Клиентский модуль, который пингует serverless-функцию
// + маркетинговые напоминания (корзина/избранное)
// Теперь пробрасываем shortId, чтобы бот показывал короткий номер.

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
async function sendToBot(type, { orderId, shortId, chatId, title, text } = {}, { requireUserChat=false } = {}) {
  const chat_id = resolveTargetChatId(chatId); // может быть null
  if (requireUserChat && !chat_id) return; // маркетинговые пинги — только реальному пользователю

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
export const notifyOrderPlaced   = (chatId, { orderId, shortId, title } = {}) => sendToBot('orderPlaced',   { orderId, shortId, chatId, title });
export const notifyOrderAccepted = (chatId, { orderId, shortId, title } = {}) => sendToBot('orderAccepted', { orderId, shortId, chatId, title });
export const notifyStatusChanged = (chatId, { orderId, shortId, title } = {}) => sendToBot('statusChanged', { orderId, shortId, chatId, title });
export const notifyOrderCanceled = (chatId, { orderId, shortId, title } = {}) => sendToBot('orderCanceled', { orderId, shortId, chatId, title });

/* Маркетинговые напоминания */
export const notifyCartReminder = (chatId, { text } = {}) =>
  sendToBot('cartReminder', { chatId, text }, { requireUserChat: true });

export const notifyFavoritesReminder = (chatId, { text } = {}) =>
  sendToBot('favReminder', { chatId, text }, { requireUserChat: true });

/* === Рефералы / Кэшбек === */
export const notifyReferralJoined = (inviterChatId, { text } = {}) =>
  sendToBot('referralJoined', { chatId: inviterChatId, text }, { requireUserChat: true });

export const notifyReferralOrderCashback = (inviterChatId, { text } = {}) =>
  sendToBot('referralOrderCashback', { chatId: inviterChatId, text }, { requireUserChat: true });

export const notifyCashbackMatured = (chatId, { text } = {}) =>
  sendToBot('cashbackMatured', { chatId, text }, { requireUserChat: true });
