// netlify/functions/notify.js
// Отправка уведомлений в Telegram: пользователю (по проверенному initData) или админам (по internal-token)
//
// ENV:
//   TG_BOT_TOKEN
//   ADMIN_API_TOKEN
//   ADMIN_CHAT_ID            // можно через запятую (несколько админов)
//   WEBAPP_URL
//   ALLOWED_ORIGINS

import crypto from 'node:crypto';

function parseAllowed(){ return (process.env.ALLOWED_ORIGINS||'').split(',').map(s=>s.trim()).filter(Boolean); }
function isTelegramOrigin(origin){ return origin==='https://t.me'||origin==='https://web.telegram.org'||origin==='https://telegram.org'; }
function originMatches(origin, rule){
  if (!rule||rule==='*') return true;
  if (!origin) return false;
  if (rule.startsWith('*.')){
    try{
      const host=new URL(origin).hostname;
      const suf=rule.slice(1);
      return host===rule.slice(2)||host.endsWith(suf);
    }catch{ return false; }
  }
  return origin===rule;
}
function buildCorsHeaders(origin, isInternal=false){
  const allowed = parseAllowed();
  const allow = isInternal || !allowed.length || !origin || isTelegramOrigin(origin) || allowed.some(rule=>originMatches(origin, rule));
  return {
    headers:{
      'Access-Control-Allow-Origin': allow ? (origin||'*') : 'null',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Tg-Init-Data, X-Internal-Auth',
      'Access-Control-Max-Age': '86400',
      'Content-Type': 'application/json; charset=utf-8',
      'Vary':'Origin'
    },
    isAllowed: allow
  };
}

function getInternalAuth(event){
  const h=event.headers||{};
  return (h['x-internal-auth']||h['X-Internal-Auth']||'').toString().trim();
}
function isInternalCall(event){
  const t=getInternalAuth(event);
  return t && process.env.ADMIN_API_TOKEN && t===process.env.ADMIN_API_TOKEN;
}

function verifyTgInitData(raw){
  const token = process.env.TG_BOT_TOKEN||'';
  if (!token) throw new Error('TG_BOT_TOKEN not set');
  const params = new URLSearchParams(String(raw||''));
  const hash = params.get('hash'); if (!hash) throw new Error('no hash');
  const pairs=[]; for (const [k,v] of params.entries()){ if (k==='hash') continue; pairs.push(`${k}=${v}`); }
  pairs.sort();
  const dataCheckString = pairs.join('\n');
  const secretKey = crypto.createHash('sha256').update(token).digest();
  const hmac = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
  if (hmac !== hash) throw new Error('bad signature');
  const user = JSON.parse(params.get('user')||'{}');
  if (!user?.id) throw new Error('no user');
  return { uid: String(user.id) };
}

/* ------------ Медиа ------------ */
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
function makeDisplayOrderId(orderId, shortId){
  const s=(shortId||'').toString().trim();
  if (s) return s.toUpperCase();
  const full=(orderId||'').toString().trim();
  if (!full) return '';
  return full.slice(-6).toUpperCase();
}
async function sendTg(token, chatId, text, kb, type){
  const imgPath = TYPE_IMG[type];
  const imgUrl = (imgPath && BASE_ASSET_URL) ? `${BASE_ASSET_URL}${imgPath}` : null;

  const common = { chat_id: chatId, parse_mode:'HTML', ...(kb?{ reply_markup: { inline_keyboard: kb } }:{}) };
  const method = imgUrl ? 'sendPhoto' : 'sendMessage';
  const payload = imgUrl
    ? { ...common, photo: imgUrl, caption: text, disable_notification:false }
    : { ...common, text, disable_web_page_preview:true };

  const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload)
  });
  const data = await r.json().catch(()=> ({}));
  if (!r.ok || data?.ok===false) throw new Error('telegram send failed');
}

/* Типы, связанные с заказами: требуем initData для внешних вызовов */
const ORDER_ONLY_USER = new Set(['orderPlaced','orderAccepted','statusChanged','orderCanceled']);

export async function handler(event){
  const origin = event.headers?.origin || event.headers?.Origin || '';
  const internal = isInternalCall(event);
  const { headers, isAllowed } = buildCorsHeaders(origin, internal);

  if (event.httpMethod === 'OPTIONS') return { statusCode:204, ...headers };
  if (event.httpMethod !== 'POST') return { statusCode:405, body:'Method Not Allowed', ...headers };
  if (!isAllowed) return { statusCode:403, body:'Forbidden by CORS', ...headers };

  try {
    const token = process.env.TG_BOT_TOKEN;
    if (!token) return { statusCode:500, body:'TG_BOT_TOKEN is not set', ...headers };

    let parsed = {};
    try { parsed = JSON.parse(event.body || '{}') || {}; } catch { parsed = {}; }

    const { chat_id: clientChatId, type, orderId, shortId, title, text } = parsed;
    if (!type) return { statusCode:400, body:'type required', ...headers };

    const webappUrl = process.env.WEBAPP_URL || '';

    const safeTitle = (t)=> (t ? String(t).slice(0,140) : '').trim();
    const goods = safeTitle(title) || 'товар';
    const kbForType = (t)=>{
      if (!webappUrl) return null;
      if (t==='cashbackMatured') return [[{ text:'Перейти к оплате', web_app:{ url: `${webappUrl}#/cart` } }]];
      if (t==='referralJoined')  return [[{ text:'Мои рефералы',  web_app:{ url: `${webappUrl}#/account/referrals` } }]];
      if (t==='referralOrderCashback') return [[{ text:'Мой кэшбек', web_app:{ url: `${webappUrl}#/account/cashback` } }]];
      return [[{ text:'Мои заказы', web_app:{ url: `${webappUrl}#/orders` } }]];
    };

    const displayOrderId = makeDisplayOrderId(orderId, shortId);
    const hint = 'Откройте приложение, чтобы посмотреть подробности.';
    const about = displayOrderId ? `Заказ #${displayOrderId}${goods ? ` — «${goods}»` : ''}.` : (goods ? `По товару «${goods}».` : '');

    let finalText;
    if (typeof text==='string' && text.trim()){ finalText = text.trim(); }
    else {
      switch(type){
        case 'orderPlaced':             finalText = `Оформлен ${about} ${hint}`; break;
        case 'orderAccepted':           finalText = `Подтверждён ${about} ${hint}`; break;
        case 'statusChanged':           finalText = `Статус обновлён. ${about} ${hint}`; break;
        case 'orderCanceled':           finalText = `Отменён ${about} ${hint}`; break;
        case 'cartReminder':            finalText = `Вы оставили товары в корзине. ${hint}`; break;
        case 'favReminder':             finalText = `У вас есть товары в избранном. ${hint}`; break;
        case 'referralJoined':          finalText = `🎉 Новый реферал! Пользователь зарегистрировался по вашей ссылке. ${hint}`; break;
        case 'referralOrderCashback':   finalText = `💸 Заказ реферала: начислено 5% кэшбека (ожидает ~24ч). ${hint}`; break;
        case 'cashbackMatured':         finalText = `✅ Кэшбек доступен для оплаты! Используйте баллы при оформлении заказа.`; break;
        default:                        finalText = `${about} ${hint}`;
      }
    }
    const kb = kbForType(type);

    // INTERNAL: можно слать прямо по chat_id (покупателю или админам)
    if (internal) {
      if (clientChatId) {
        await sendTg(token, String(clientChatId), finalText, kb, type);
        return { statusCode:200, body: JSON.stringify({ ok:true }), ...headers };
      }
      const adminChatIds = String(process.env.ADMIN_CHAT_ID || '').split(',').map(s=>s.trim()).filter(Boolean);
      if (adminChatIds.length) {
        const results = await Promise.allSettled(adminChatIds.map(id => sendTg(token, String(id), finalText, kb, type)));
        const anyOk = results.some(r => r.status==='fulfilled');
        if (!anyOk) return { statusCode:502, body: JSON.stringify({ ok:false, error:'telegram failed for all admins' }), ...headers };
        return { statusCode:200, body: JSON.stringify({ ok:true }), ...headers };
      }
      return { statusCode:400, body:'chat_id required', ...headers };
    }

    // ВНЕШНИЕ ВЫЗОВЫ: только через проверенное initData
    const isMarketing = (type==='cartReminder' || type==='favReminder');
    if (isMarketing || ORDER_ONLY_USER.has(type)) {
      const rawInit = event.headers?.['x-tg-init-data'] || event.headers?.['X-Tg-Init-Data'] || '';
      const { uid } = verifyTgInitData(rawInit);
      if (!clientChatId || String(clientChatId)!==uid) {
        return { statusCode:403, body: JSON.stringify({ ok:false, error:'chat_id mismatch or missing' }), ...headers };
      }
      await sendTg(token, String(uid), finalText, kb, type);
      return { statusCode:200, body: JSON.stringify({ ok:true }), ...headers };
    }

    return { statusCode:403, body: JSON.stringify({ ok:false, error:'forbidden' }), ...headers };
  } catch (err) {
    console.error('[notify] handler error:', err);
    return { statusCode:500, body: JSON.stringify({ ok:false, error:String(err) }), ...headers };
  }
}
