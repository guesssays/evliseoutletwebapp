// netlify/functions/app-config.js
export async function handler() {
  // Включи/выключи режим через переменную окружения:
  // MAINTENANCE_MODE=1 => экран техработ, 0/пусто => обычный режим
  const maintenance = String(process.env.MAINTENANCE_MODE || '0') === '1';

  // Куда вести кнопку "написать оператору"
  const opChat = process.env.OP_CHAT_URL || 'https://t.me/evliseorder';

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
    },
    body: JSON.stringify({ ok: true, maintenance, opChat }),
  };
}
