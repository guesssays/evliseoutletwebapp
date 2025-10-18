// netlify/functions/notify.js

// Serverless-функция Netlify: принимает событие от фронта и шлёт "тизер" в Telegram бота
// ENV:
//   TG_BOT_TOKEN     — токен бота (без "bot" префикса)        [обязателен]
//   ADMIN_CHAT_ID    — chat_id администратора                  [рекомендуется]
//   WEBAPP_URL       — базовый URL приложения для ссылок       [опционально]
//   ALLOWED_ORIGINS  — список origin'ов через запятую          [опционально]

export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const origin = event.headers?.origin || '';
  const allowed = (process.env.ALLOWED_ORIGINS || '')
    .split(',').map(s=>s.trim()).filter(Boolean);
  if (allowed.length && origin && !allowed.includes(origin)) {
    return { statusCode: 403, body: 'Forbidden' };
  }

  try {
    const { chat_id: clientChatId, type, orderId, title } = JSON.parse(event.body || '{}') || {};
    if (!type) return { statusCode: 400, body: 'type required' };

    const token = process.env.TG_BOT_TOKEN;
    if (!token) return { statusCode: 500, body: 'TG_BOT_TOKEN is not set' };

    const webappUrl = process.env.WEBAPP_URL || '';
    const targetChatId = String(clientChatId || process.env.ADMIN_CHAT_ID || '').trim();
    if (!targetChatId) {
      return { statusCode: 400, body: 'chat_id required (or ADMIN_CHAT_ID must be set)' };
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

    const data = await res.json();
    if (!res.ok || !data.ok) {
      return { statusCode: 502, body: JSON.stringify({ ok:false, tg:data }) };
    }

    return { statusCode: 200, body: JSON.stringify({ ok:true }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ ok:false, error:String(err) }) };
  }
}
