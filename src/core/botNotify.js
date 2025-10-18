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
 *  КРИТИЧЕСКИЙ ФИКС: НЕ требуем chat_id на клиенте — сервер сам подставит ADMIN_CHAT_ID.
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
    // молча игнорируем, чтобы не ломать UX (при желании логируйте в Sentry)
  }
}

/* Публичные хелперы — первый аргумент: целевой chatId (опционально) */
export const notifyOrderPlaced   = (chatId, { orderId, title } = {}) => sendToBot('orderPlaced',   { orderId, chatId, title });
export const notifyOrderAccepted = (chatId, { orderId, title } = {}) => sendToBot('orderAccepted', { orderId, chatId, title });
export const notifyStatusChanged = (chatId, { orderId, title } = {}) => sendToBot('statusChanged', { orderId, chatId, title });
export const notifyOrderCanceled = (chatId, { orderId, title } = {}) => sendToBot('orderCanceled', { orderId, chatId, title });


// ===================== Netlify Function =====================
// Serverless-функция Netlify: принимает событие от фронта и шлёт "тизер" в Telegram бота
// Переменные окружения:
//   TG_BOT_TOKEN     — токен бота (без "bot" префикса)        [обязателен]
//   ADMIN_CHAT_ID    — chat_id администратора                  [рекомендуется]
//   WEBAPP_URL       — базовый URL приложения для ссылок       [опционально]
//   ALLOWED_ORIGINS  — список origin'ов через запятую          [опционально]

export async function handler(event) {
  // Разрешаем только POST
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  // Опциональная защита от кросс-доменных запросов
  const origin = event.headers?.origin || '';
  const allowed = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  // Если список задан и origin присутствует — проверяем
  if (allowed.length && origin && !allowed.includes(origin)) {
    return { statusCode: 403, body: 'Forbidden' };
  }

  try {
    const { chat_id: clientChatId, type, orderId, title } = JSON.parse(event.body || '{}') || {};
    if (!type)    return { statusCode: 400, body: 'type required' };

    const token = process.env.TG_BOT_TOKEN;
    if (!token) return { statusCode: 500, body: 'TG_BOT_TOKEN is not set' };

    const webappUrl = process.env.WEBAPP_URL || 'https://evliseoutlet.netlify.app';

    // КРИТИЧЕСКИЙ ФИКС: если клиент не прислал chat_id, шлём админу
    const targetChatId = String(clientChatId || process.env.ADMIN_CHAT_ID || '').trim();
    if (!targetChatId) {
      return { statusCode: 400, body: 'chat_id required (or ADMIN_CHAT_ID must be set)' };
    }

    // Безопасное сокращение и экранирование текста
    const safeTitle = (t) => (t ? String(t).slice(0, 140) : '').trim();
    const goods = safeTitle(title) || 'товар';

    const link = `${webappUrl}${orderId ? `#/track/${encodeURIComponent(orderId)}` : '#/orders'}`;
    const btn  = [{
      text: orderId ? `Заказ #${orderId}` : 'Открыть приложение',
      web_app: { url: link }
    }];

    const hint = 'Откройте приложение, чтобы посмотреть подробности.';
    const about = orderId
      ? `Заказ #${orderId}${goods ? ` — «${goods}»` : ''}.`
      : (goods ? `По товару «${goods}».` : '');

    let text;
    switch (type) {
      case 'orderPlaced':
        text = `Оформлен ${about} ${hint}`;
        break;
      case 'orderAccepted':
        text = `Подтверждён ${about} ${hint}`;
        break;
      case 'statusChanged':
        text = `Статус обновлён. ${about} ${hint}`;
        break;
      case 'orderCanceled':
        text = `Отменён ${about} ${hint}`;
        break;
      default:
        text = `${about} ${hint}`;
    }

    // Отправляем сообщение через Bot API
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: targetChatId,
        text,
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: [btn] },
        disable_web_page_preview: true
      })
    });

    const data = await res.json();
    if (!res.ok || !data.ok) {
      // Прокидываем ответ Telegram для отладки
      return { statusCode: 502, body: JSON.stringify({ ok: false, tg: data }) };
    }

    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: String(err) }) };
  }
}
