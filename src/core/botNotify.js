// Клиентский модуль, который умеет пинговать serverless-функцию
// Вызывается из app.js при событиях оформления/подтверждения/смены статуса/отмены

const ENDPOINT = '/.netlify/functions/notify';

/** Возвращает telegram user id, если WebApp открыт из бота */
export function getTelegramChatId() {
  const tg = window?.Telegram?.WebApp;
  const id = tg?.initDataUnsafe?.user?.id;
  return id ? String(id) : null;
}

/** Базовый отправитель события в бота (через Netlify Function) */
async function sendToBot(type, { orderId } = {}) {
  const chat_id = getTelegramChatId();
  if (!chat_id) {
    // Бот не сможет написать, если WebApp открыт вне бота (или пользователь не нажал Start)
    return;
  }
  try {
    await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id, type, orderId })
    });
  } catch {
    // молча игнорируем, чтобы не ломать UX, но можно логировать в Sentry
  }
}

/* Публичные хелперы */
export const notifyOrderPlaced   = (orderId)=> sendToBot('orderPlaced',   { orderId });
export const notifyOrderAccepted = (orderId)=> sendToBot('orderAccepted', { orderId });
export const notifyStatusChanged = (orderId)=> sendToBot('statusChanged', { orderId });
export const notifyOrderCanceled = (orderId)=> sendToBot('orderCanceled', { orderId });
