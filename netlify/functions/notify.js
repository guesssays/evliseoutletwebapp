// netlify/functions/notify.js
// Serverless-функция Netlify: принимает событие от фронта и шлёт "тизер" в Telegram бота
// ENV:
//   TG_BOT_TOKEN     — токен бота (без "bot" префикса)        [обязателен для отправки]
//   ADMIN_CHAT_ID    — chat_id(ы) администратора(ов), через запятую
//   WEBAPP_URL       — базовый URL приложения для ссылок       [опционально]
//   ALLOWED_ORIGINS  — список origin'ов через запятую          [опционально: '*', точные origin, '*.domain.com']
//
// Types (type):
//   orderPlaced | orderAccepted | statusChanged | orderCanceled
//   cartReminder | favReminder
//   referralJoined | referralOrderCashback | cashbackMatured
//
// Медиа: если для type задан путь в TYPE_IMG — шлём sendPhoto с подписью.
// Рекомендуемый размер: ~1200×675 (16:9). Файлы положить в /assets/notify/*

function parseAllowed() {
  const raw = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  return raw;
}

function isTelegramOrigin(origin) {
  return origin === 'https://t.me' ||
         origin === 'https://web.telegram.org' ||
         origin === 'https://telegram.org';
}

function originMatches(origin, rule) {
  if (!rule || rule === '*') return true;
  if (!origin) return false;
  if (rule.startsWith('*.')) {
    try {
      const host = new URL(origin).hostname;
      const suffix = rule.slice(1); // ".example.com"
      return host === rule.slice(2) || host.endsWith(suffix);
    } catch { return false; }
  }
  return origin === rule;
}

function buildCorsHeaders(origin) {
  const allowed = parseAllowed();

  // ✅ Разрешаем пустой Origin для сервер-к-сервер запросов
  const isAllowed = !allowed.length ||
                    !origin ||
                    isTelegramOrigin(origin) ||
                    allowed.some(rule => originMatches(origin, rule));

  const allowOrigin = isAllowed ? (origin || '*') : 'null';

  return {
    headers: {
      'Access-Control-Allow-Origin': allowOrigin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Vary': 'Origin',
    },
    isAllowed,
  };
}

/* ------------ Медиа для уведомлений ------------ */
const BASE_ASSET_URL = (process.env.URL || process.env.DEPLOY_URL || '').replace(/\/+$/, '');
const TYPE_IMG = {
  orderPlaced:            '/assets/notify/order_placed1.jpg',
  orderAccepted:          '/assets/notify/order_accepted1.jpg',
  statusChanged:          '/assets/notify/status_changed1.jpg',
  orderCanceled:          '/assets/notify/order_canceled1.jpg',
  cartReminder:           '/assets/notify/cart_reminder1.jpg',
  favReminder:            '/assets/notify/fav_reminder1.jpg',
  referralJoined:         '/assets/notify/referral_joined1.jpg',
  referralOrderCashback:  '/assets/notify/referral_cashback_pending1.jpg',
  cashbackMatured:        '/assets/notify/cashback_ready1.jpg',
};

/**
 * Универсальная отправка: если есть картинка для type — sendPhoto, иначе sendMessage
 */
async function sendTg(token, chatId, text, kb, type){
  const imgPath = TYPE_IMG[type];
  const imgUrl = (imgPath && BASE_ASSET_URL) ? `${BASE_ASSET_URL}${imgPath}` : null;

  const common = {
    chat_id: chatId,
    parse_mode: 'HTML',
    ...(kb ? { reply_markup: { inline_keyboard: kb } } : {})
  };

  const method = imgUrl ? 'sendPhoto' : 'sendMessage';
  const payload = imgUrl
    ? { ...common, photo: imgUrl, caption: text, disable_notification: false }
    : { ...common, text, disable_web_page_preview: true };

  const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const data = await r.json().catch(() => ({}));
  if (!r.ok || data?.ok === false) throw new Error('telegram send failed');
}

export async function handler(event) {
  const origin = event.headers?.origin || event.headers?.Origin || '';
  const { headers, isAllowed } = buildCorsHeaders(origin);

  // CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, ...headers };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed', ...headers };
  }

  if (!isAllowed) {
    return { statusCode: 403, body: 'Forbidden by CORS', ...headers };
  }

  try {
    const { chat_id: clientChatId, type, orderId, title, text } = JSON.parse(event.body || '{}') || {};
    if (!type) return { statusCode: 400, body: 'type required', ...headers };

    const token = process.env.TG_BOT_TOKEN;
    if (!token) return { statusCode: 500, body: 'TG_BOT_TOKEN is not set', ...headers };

    const webappUrl   = process.env.WEBAPP_URL || '';
    const adminChatIds = String(process.env.ADMIN_CHAT_ID || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);

    // «маркетинговые» пинги, которые не шлём админам
    const isMarketing = (type === 'cartReminder' || type === 'favReminder');

    const safeTitle = (t)=> (t ? String(t).slice(0,140) : '').trim();
    const goods = safeTitle(title) || 'товар';

    // Кнопки по типам
    const kbForType = (t)=>{
      if (!webappUrl) return null;
      if (t === 'cashbackMatured') {
        return [[{ text: 'Перейти к оплате', web_app: { url: `${webappUrl}#/cart` } }]];
      }
      if (t === 'referralJoined') {
        return [[{ text: 'Мои рефералы', web_app: { url: `${webappUrl}#/account/referrals` } }]];
      }
      if (t === 'referralOrderCashback') {
        return [[{ text: 'Мой кэшбек', web_app: { url: `${webappUrl}#/account/cashback` } }]];
      }
      // дефолт — «Мои заказы»
      return [[{ text: 'Мои заказы', web_app: { url: `${webappUrl}#/orders` } }]];
    };

    const hint = 'Откройте приложение, чтобы посмотреть подробности.';
    const about = orderId
      ? `Заказ #${orderId}${goods ? ` — «${goods}»` : ''}.`
      : (goods ? `По товару «${goods}».` : '');

    let finalText;
    if (typeof text === 'string' && text.trim()){
      finalText = text.trim();
    } else {
      switch (type) {
        case 'orderPlaced':             finalText = `Оформлен ${about} ${hint}`; break;
        case 'orderAccepted':           finalText = `Подтверждён ${about} ${hint}`; break;
        case 'statusChanged':           finalText = `Статус обновлён. ${about} ${hint}`; break;
        case 'orderCanceled':           finalText = `Отменён ${about} ${hint}`; break;
        case 'cartReminder':            finalText = `Вы оставили товары в корзине. ${hint}`; break;
        case 'favReminder':             finalText = `У вас есть товары в избранном. ${hint}`; break;
        case 'referralJoined':          finalText = `🎉 Новый реферал! Пользователь зарегистрировался по вашей ссылке. ${hint}`; break;
        case 'referralOrderCashback':   finalText = `💸 Заказ реферала: начислено 5% кэшбека (ожидает 24ч). ${hint}`; break;
        case 'cashbackMatured':         finalText = `✅ Кэшбек доступен для оплаты! Используйте баллы при оформлении заказа.`; break;
        default:                        finalText = `${about} ${hint}`;
      }
    }

    const kb = kbForType(type);

    // 1) Если указан clientChatId — отправляем только клиенту
    if (clientChatId) {
      await sendTg(token, String(clientChatId), finalText, kb, type);
      return { statusCode: 200, body: JSON.stringify({ ok:true }), ...headers };
    }

    // 2) Иначе (служебные), рассылаем всем админам (если не маркетинг)
    if (!isMarketing && adminChatIds.length) {
      const results = await Promise.allSettled(
        adminChatIds.map(id => sendTg(token, String(id), finalText, kb, type))
      );
      const anyOk = results.some(r => r.status === 'fulfilled');
      if (!anyOk) {
        return { statusCode: 502, body: JSON.stringify({ ok:false, error:'telegram failed for all admins' }), ...headers };
      }
      return { statusCode: 200, body: JSON.stringify({ ok:true }), ...headers };
    }

    return { statusCode: 400, body: 'chat_id required', ...headers };
  } catch (err) {
    console.error('[notify] handler error:', err);
    return { statusCode: 500, body: JSON.stringify({ ok:false, error:String(err) }), ...headers };
  }
}
