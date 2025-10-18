// Serverless-функция Netlify: принимает событие от фронта и шлёт "тизер" в Telegram бота
// Требуются переменные окружения:
//   TG_BOT_TOKEN  — токен бота (без "bot" префикса)
//   WEBAPP_URL    — базовый URL вашего приложения (для ссылки в сообщении), опционально

export async function handler(event) {
  // Разрешаем только POST
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  // Простейшая защита от кросс-доменных запросов (опционально)
  const origin = event.headers?.origin || '';
  const allowed = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim())
    : []; // например: "https://evliseoutlet.netlify.app"
  if (allowed.length && !allowed.includes(origin)) {
    return { statusCode: 403, body: 'Forbidden' };
  }

  try {
    const { chat_id, type, orderId } = JSON.parse(event.body || '{}') || {};
    if (!chat_id) return { statusCode: 400, body: 'chat_id required' };
    if (!type)    return { statusCode: 400, body: 'type required' };

    const token = process.env.TG_BOT_TOKEN;
    if (!token) return { statusCode: 500, body: 'TG_BOT_TOKEN is not set' };

    const webappUrl = process.env.WEBAPP_URL || 'https://evliseoutlet.netlify.app';

    // Тексты-«тизеры» (без деталей, чтобы пользователь зашёл в приложение)
    const makeText = () => {
      const base = `У вас новое обновление по заказам.`;
      const hint = `Откройте приложение, чтобы посмотреть подробности.`;
      const link = `${webappUrl}${orderId ? `#/track/${encodeURIComponent(orderId)}` : '#/orders'}`;
      const btn  = [{ text: 'Открыть приложение', web_app: { url: link } }];
      let text = base;

      switch (type) {
        case 'orderPlaced':     text = `Заказ оформлен. ${hint}`; break;
        case 'orderAccepted':   text = `Заказ принят администратором. ${hint}`; break;
        case 'statusChanged':   text = `Статус заказа обновлён. ${hint}`; break;
        case 'orderCanceled':   text = `Заказ отменён. ${hint}`; break;
        default:                text = `${base} ${hint}`;
      }
      return { text, btn };
    };

    const { text, btn } = makeText();

    // Отправляем сообщение через Bot API
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id,
        text,
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: [btn] },
        disable_web_page_preview: true,
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
