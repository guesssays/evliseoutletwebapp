// Serverless-функция Netlify: принимает событие от фронта и шлёт "тизер" в Telegram бота
// Переменные окружения:
//   TG_BOT_TOKEN   — токен бота (без "bot" префикса)
//   WEBAPP_URL     — базовый URL вашего приложения (для ссылки в сообщении), опционально
//   ALLOWED_ORIGINS — запятая-разделённый список origin'ов (опционально)

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
    const { chat_id, type, orderId, title } = JSON.parse(event.body || '{}') || {};
    if (!chat_id) return { statusCode: 400, body: 'chat_id required' };
    if (!type)    return { statusCode: 400, body: 'type required' };

    const token = process.env.TG_BOT_TOKEN;
    if (!token) return { statusCode: 500, body: 'TG_BOT_TOKEN is not set' };

    const webappUrl = process.env.WEBAPP_URL || 'https://evliseoutlet.netlify.app';

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
        chat_id,
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
