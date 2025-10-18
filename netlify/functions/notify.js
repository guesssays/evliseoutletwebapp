// netlify/functions/notify.js
// Serverless-функция Netlify: принимает событие от фронта и шлёт "тизер" в Telegram бота
// ENV:
//   TG_BOT_TOKEN     — токен бота (без "bot" префикса)        [обязателен для отправки]
//   ADMIN_CHAT_ID    — chat_id администратора                  [желателен; иначе ждём chat_id от клиента]
//   WEBAPP_URL       — базовый URL приложения для ссылок       [опционально]
//   ALLOWED_ORIGINS  — список origin'ов через запятую          [опционально: '*', точные origin, '*.domain.com']

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
  const isAllowed = !allowed.length ||
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
    const { chat_id: clientChatId, type, orderId, title } = JSON.parse(event.body || '{}') || {};
    if (!type) return { statusCode: 400, body: 'type required', ...headers };

    const token = process.env.TG_BOT_TOKEN;
    if (!token) return { statusCode: 500, body: 'TG_BOT_TOKEN is not set', ...headers };

    const webappUrl   = process.env.WEBAPP_URL || '';
    const adminChatId = String(process.env.ADMIN_CHAT_ID || '').trim();
    const targetChatId = String(clientChatId || adminChatId || '').trim();
    if (!targetChatId) {
      return { statusCode: 400, body: 'chat_id required (or ADMIN_CHAT_ID must be set)', ...headers };
    }

    const safeTitle = (t)=> (t ? String(t).slice(0,140) : '').trim();
    const goods = safeTitle(title) || 'товар';
    const link = webappUrl ? `${webappUrl}${orderId ? `#/track/${encodeURIComponent(orderId)}` : '#/orders'}` : undefined;

    const btn = link ? [{
      text: orderId ? `Заказ #${orderId}` : 'Открыть приложение',
      web_app: { url: link }
    }] : null;

    const hint = 'Откройте приложение, чтобы посмотреть подробности.';
    const about = orderId
      ? `Заказ #${orderId}${goods ? ` — «${goods}»` : ''}.`
      : (goods ? `По товару «${goods}».` : '');

    let text;
    switch (type) {
      case 'orderPlaced':    text = `Оформлен ${about} ${hint}`; break;
      case 'orderAccepted':  text = `Подтверждён ${about} ${hint}`; break;
      case 'statusChanged':  text = `Статус обновлён. ${about} ${hint}`; break;
      case 'orderCanceled':  text = `Отменён ${about} ${hint}`; break;
      default:               text = `${about} ${hint}`;
    }

    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: targetChatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        ...(btn ? { reply_markup: { inline_keyboard: [btn] } } : {})
      })
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.ok) {
      return { statusCode: 502, body: JSON.stringify({ ok:false, tg:data }), ...headers };
    }

    return { statusCode: 200, body: JSON.stringify({ ok:true }), ...headers };
  } catch (err) {
    console.error('[notify] handler error:', err);
    return { statusCode: 500, body: JSON.stringify({ ok:false, error:String(err) }), ...headers };
  }
}
