// netlify/functions/bot-webhook.js
// Рассылка /broadcast с предпросмотром и подтверждением.
// Персистентная FSM + антидубли, устойчиво к eventual-consistency Netlify Blobs.
// Плюс: /stats для отчёта по Direct Link (Mini App start_param).
//
// ENV:
//   TG_BOT_TOKEN        — токен бота (без "bot") [обяз.]
//   ADMIN_CHAT_ID       — список chat_id через запятую [обяз.]
//   WEBAPP_URL          — ссылка WebApp (внутри Telegram) [опц.]
//   BLOB_BUCKET         — имя стора Blobs (по умолчанию 'appstore')
//   WELCOME_ASSET_PATH  — относительный путь к картинке из билда (по умолчанию assets/images/welcome.jpg)
//   WELCOME_TEXT        — подпись/текст приветствия (если не задан — берётся дефолтный текст ниже)

import { getStore } from '@netlify/blobs';

const TOKEN = process.env.TG_BOT_TOKEN || '';
const WEBAPP_URL = process.env.WEBAPP_URL || '';
const WELCOME_ASSET_PATH = (process.env.WELCOME_ASSET_PATH || 'assets/images/welcome.jpg').replace(/^\/+/, '');
const STATS_KEY = 'stats_miniapp_open.json';

// ▼ Приветственный текст по умолчанию
const WELCOME_TEXT = process.env.WELCOME_TEXT || `Добро пожаловать в EVLISE OUTLET — онлайн-магазин одежды в Узбекистане. Нам доверяют, ведь мы с 2024 года делаем покупки прозрачными и выгодными.

Теперь онлайн-шоппинг с Evlise стал ещё удобнее: 

— отслеживание заказов по этапам;
— кэшбек баллами за каждую покупку;
— реферальная программа;
— умный подбор размера;
— избранное для ваших находок;
— реальные фотографии вещей.

Здесь вы сразу видите, где сейчас ваш заказ, получаете кэшбек, которым можно оплачивать покупки, приглашаете друзей и зарабатываете бонусы. Умный подбор размера подскажет подходящую посадку. Сохраняйте любимые модели в Избранное и смотрите реальные фото вещей — отбросив сомнения в выборе.

Готовы подобрать идеальный образ?`;

if (!TOKEN) throw new Error('TG_BOT_TOKEN is required');

function admins() {
  const raw = (process.env.ADMIN_CHAT_ID ?? '').toString();
  return raw.split(',').map(s => s.trim()).filter(Boolean);
}
const ADMIN_IDS = admins();
const isAdmin = (id) => ADMIN_IDS.includes(String(id));
const API = (m) => `https://api.telegram.org/bot${TOKEN}/${m}`;

/* -------------------- Blobs helpers -------------------- */
async function readJSON(store, key, fallback = {}) {
  try { const v = await store.get(key, { type: 'json' }); return v ?? fallback; }
  catch { return fallback; }
}
async function writeJSON(store, key, obj) {
  await store.set(key, JSON.stringify(obj ?? {}), { contentType: 'application/json' });
}

/* -------------------- Telegram helpers -------------------- */
async function tg(method, payload) {
  const r = await fetch(API(method), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || data.ok === false) {
    const err = data?.description || `${r.status} ${r.statusText}`;
    throw new Error(`Telegram ${method} failed: ${err}`);
  }
  return data.result;
}
async function safeSend(method, base) {
  try { return await tg(method, base); }
  catch (e) {
    const m = String(e?.message || '');
    if (m.includes('parse entities') || m.includes('Wrong entity')) {
      const copy = { ...base }; delete copy.parse_mode;
      return tg(method, copy);
    }
    throw e;
  }
}

/* --------------- Anti-duplicate by update_id --------------- */
const DEDUPE_KEY = 'updates_dedupe.json';
async function seenUpdate(store, updateId) {
  const bag = await readJSON(store, DEDUPE_KEY, { ids: [] });
  const id = Number(updateId);
  if (!Number.isFinite(id)) return false;
  if (bag.ids.includes(id)) return true;
  bag.ids.push(id);
  if (bag.ids.length > 250) bag.ids = bag.ids.slice(-250);
  await writeJSON(store, DEDUPE_KEY, bag);
  return false;
}

/* ---------------- Users registry ---------------- */
async function upsertUser(store, from) {
  const uid = String(from?.id || '').trim();
  if (!uid) return;
  const users = await readJSON(store, 'users.json', {});
  const existed = !!users[uid];
  users[uid] = {
    first_name: String(from.first_name || '').trim(),
    last_name : String(from.last_name  || '').trim(),
    username  : String(from.username   || '').trim(),
    ts: users[uid]?.ts || Date.now(),
  };
  await writeJSON(store, 'users.json', users);

  if (!existed) {
    const total = Object.keys(users).length;
    const text = [
      '<b>Новый пользователь</b>',
      `${users[uid].first_name}${users[uid].last_name ? ' ' + users[uid].last_name : ''}`,
      users[uid].username ? `( @${users[uid].username} )` : '',
      `\nID: <code>${uid}</code>`,
      `\nВсего пользователей: <b>${total}</b>`
    ].join(' ').replace(/\s+/g, ' ');
    await Promise.allSettled(ADMIN_IDS.map(aid =>
      tg('sendMessage', { chat_id: aid, text, parse_mode: 'HTML', disable_web_page_preview: true })
    ));
  }
}

/* ---------------- Buttons & post build ---------------- */
function parseButtonsFromText(md) {
  const text = (md || '').trim();
  const linkRe = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
  const buttons = [];
  let m; while ((m = linkRe.exec(text)) !== null) buttons.push({ text: m[1], url: m[2] });

  const kb = [];
  if (buttons.length) kb.push(...buttons.map(b => [b]));
  if (WEBAPP_URL) kb.push([{ text: 'Открыть приложение', web_app: { url: WEBAPP_URL } }]);
  return kb.length ? { inline_keyboard: kb } : undefined;
}
function buildPostFromMessage(msg) {
  const hasPhoto = Array.isArray(msg.photo) && msg.photo.length > 0;
  const hasVideo = !!msg.video;
  const caption = (msg.caption || '').trim();
  const text = (msg.text || '').trim();
  const body = hasPhoto || hasVideo ? caption : text;
  const reply_markup = parseButtonsFromText(body);

  if (hasPhoto) {
    const largest = msg.photo[msg.photo.length - 1];
    return { type: 'photo', payload: { photo: largest.file_id, caption: body || undefined, parse_mode: 'MarkdownV2', disable_notification: false, reply_markup } };
  }
  if (hasVideo) {
    return { type: 'video', payload: { video: msg.video.file_id, caption: body || undefined, parse_mode: 'MarkdownV2', disable_notification: false, reply_markup } };
  }
  return { type: 'text', payload: { text: body || ' ', parse_mode: 'MarkdownV2', disable_web_page_preview: true, disable_notification: false, reply_markup } };
}
async function sendPostTo(chatId, post) {
  const p = post?.payload || {};
  if (post.type === 'photo') return safeSend('sendPhoto',  { chat_id: chatId, ...p });
  if (post.type === 'video') return safeSend('sendVideo',  { chat_id: chatId, ...p });
  return safeSend('sendMessage', { chat_id: chatId, ...p });
}

/* ---------------- Broadcast helpers ---------------- */
function confirmKeyboard(sessionId) {
  return {
    inline_keyboard: [
      [{ text: '✅ Подтвердить отправку', callback_data: `bc:confirm:${sessionId}` }],
      [{ text: '❌ Отменить',             callback_data: `bc:cancel:${sessionId}`  }],
    ]
  };
}
async function broadcastToAllUsers({ store, post }) {
  const users = await readJSON(store, 'users.json', {});
  const ids = Object.keys(users);
  if (!ids.length) return { total: 0, ok: 0, fail: 0 };

  const CHUNK = 25, PAUSE_MS = 450;
  const res = { total: ids.length, ok: 0, fail: 0 };

  for (let i = 0; i < ids.length; i += CHUNK) {
    const slice = ids.slice(i, i + CHUNK);
    await Promise.all(slice.map(uid =>
      sendPostTo(uid, post).then(() => { res.ok++; }).catch(() => { res.fail++; })
    ));
    if (i + CHUNK < ids.length) await new Promise(r => setTimeout(r, PAUSE_MS));
  }
  return res;
}

/* ------------- Admin state (pointer + sessions) -------------- */
async function setPointer(store, adminId, patch) {
  const key = 'broadcast_state.json';
  const st = await readJSON(store, key, {});
  if (patch === null) delete st[adminId];
  else st[adminId] = { ...(st[adminId] || {}), ...patch };
  await writeJSON(store, key, st);
}
async function getPointer(store, adminId) {
  const st = await readJSON(store, 'broadcast_state.json', {});
  return st[adminId] || null;
}
function sessionKey(adminId, sessionId) {
  return `broadcast_session_${adminId}_${sessionId}.json`;
}

/* ---------------- Welcome helper (asset from build) ----------- */
function welcomeKeyboard() {
  return WEBAPP_URL
    ? { inline_keyboard: [[{ text: 'Открыть приложение', web_app: { url: WEBAPP_URL } }]] }
    : undefined;
}
function resolveAssetUrl(relPath) {
  // Абсолютный URL сайта (production/staging), без хвостового слэша
  const base = (process.env.URL || process.env.DEPLOY_URL || '').replace(/\/+$/, '');
  if (!base) return null;
  return `${base}/${relPath.replace(/^\/+/, '')}`;
}
async function sendWelcome(chatId) {
  const photoUrl = resolveAssetUrl(WELCOME_ASSET_PATH);
  const CAPTION_LIMIT = 1024;
  const needsSplit = (WELCOME_TEXT || '').length > CAPTION_LIMIT;

  if (photoUrl) {
    const caption = needsSplit ? 'Добро пожаловать в EVLISE OUTLET' : WELCOME_TEXT;
    await safeSend('sendPhoto', {
      chat_id: chatId,
      photo: photoUrl,
      caption,
      reply_markup: welcomeKeyboard()
    });
    if (needsSplit) {
      await safeSend('sendMessage', { chat_id: chatId, text: WELCOME_TEXT });
    }
    return;
  }
  await safeSend('sendMessage', {
    chat_id: chatId,
    text: WELCOME_TEXT,
    reply_markup: welcomeKeyboard()
  });
}

/* ---------------- Stats helper ---------------- */
function formatStatsText(stats, daysWindow = 14, topTags = 20) {
  if (!stats || typeof stats !== 'object') return 'Статистика пуста.';
  const total = Number(stats.total || 0);
  const tags = stats.tags || {};
  const byDay = stats.byDay || {};

  const top = Object.entries(tags)
    .sort((a,b) => b[1]-a[1])
    .slice(0, topTags);

  const lines = [];
  lines.push(`📈 Статистика Mini App`);
  lines.push(`Всего открытий: ${total}`);
  if (top.length) {
    lines.push(`\nПо меткам:`);
    for (const [tag, cnt] of top) {
      lines.push(`• ${tag}: ${cnt}`);
    }
  } else {
    lines.push(`\nПо меткам: пока нет данных`);
  }

  // последние N дней, по убыванию даты
  const days = Object.keys(byDay).sort().slice(-daysWindow);
  if (days.length) {
    lines.push(`\nПоследние ${days.length} дней:`);
    for (const d of days) {
      const rec = byDay[d] || { total:0, tags:{} };
      const subtags = Object.entries(rec.tags || {})
        .sort((a,b)=>b[1]-a[1])
        .slice(0,5)
        .map(([t,c]) => `${t} ${c}`)
        .join(', ');
      lines.push(`${d}: ${rec.total}${subtags ? ` (${subtags})` : ''}`);
    }
  }
  return lines.join('\n');
}

/* ============================ Webhook ============================ */
export default async function handler(req) {
  if (req.method !== 'POST') return new Response('ok', { status: 200 });
  const store = getStore(process.env.BLOB_BUCKET || 'appstore');

  let update;
  try { update = await req.json(); } catch { return new Response('ok', { status: 200 }); }
  if (await seenUpdate(store, update?.update_id)) return new Response('ok', { status: 200 });

  try {
    /* --------- A) callback_query (confirm/cancel) --------- */
    if (update.callback_query) {
      const cq = update.callback_query;
      const fromId = String(cq.from?.id || '');
      const data = cq.data || '';

      if (!isAdmin(fromId)) {
        await tg('answerCallbackQuery', { callback_query_id: cq.id, text: 'Недостаточно прав' });
        return new Response('ok', { status: 200 });
      }

      const [, action, sid] = String(data).split(':'); // bc:confirm:<sid> | bc:cancel:<sid>
      const pointer = await getPointer(store, fromId);

      if (!pointer || pointer.sessionId !== sid) {
        await tg('answerCallbackQuery', { callback_query_id: cq.id, text: 'Эта сессия уже неактивна' });
        return new Response('ok', { status: 200 });
      }

      if (action === 'cancel') {
        await setPointer(store, fromId, null);
        await tg('answerCallbackQuery', { callback_query_id: cq.id, text: 'Отменено' });
        await tg('sendMessage', { chat_id: fromId, text: 'Рассылка отменена.' });
        return new Response('ok', { status: 200 });
      }

      if (action === 'confirm') {
        const sess = await readJSON(store, sessionKey(fromId, sid), null);
        if (!sess?.post) {
          await tg('answerCallbackQuery', { callback_query_id: cq.id, text: 'Сессия не найдена' });
          return new Response('ok', { status: 200 });
        }
        await tg('answerCallbackQuery', { callback_query_id: cq.id, text: 'Отправляем…' });
        const res = await broadcastToAllUsers({ store, post: sess.post });
        await setPointer(store, fromId, null);
        await tg('sendMessage', {
          chat_id: fromId,
          text: res.total === 0
            ? 'В базе пользователей пока никого нет. Никому отправлять.'
            : `Готово: всего ${res.total}, отправлено ${res.ok}, ошибок ${res.fail}.`
        });
        return new Response('ok', { status: 200 });
      }

      await tg('answerCallbackQuery', { callback_query_id: cq.id, text: 'Неизвестное действие' });
      return new Response('ok', { status: 200 });
    }

    /* --------- B) обычные сообщения/редактирование --------- */
    const msg = update.message || update.edited_message;
    if (!msg) return new Response('ok', { status: 200 });

    const chatId = String(msg.chat?.id || '');
    const text = (msg.text || msg.caption || '').trim();
    const isCommand = !!(msg.text && msg.text.startsWith('/'));

    // 1) пользователи (не админы)
    if (!isAdmin(chatId)) {
      await upsertUser(store, msg.from);
      if (text?.startsWith('/start')) {
        await sendWelcome(chatId);
      }
      return new Response('ok', { status: 200 });
    }

    // 2) состояние администратора
    const pointer = await getPointer(store, chatId);

    // --- если ждём пост: команды обрабатываем ПЕРВЫМИ
    if (pointer?.mode === 'await_post') {
      if (isCommand) {
        if (text.startsWith('/cancel')) {
          await setPointer(store, chatId, null);
          await tg('sendMessage', { chat_id: chatId, text: 'Рассылка отменена.' });
          return new Response('ok', { status: 200 });
        }
        if (text.startsWith('/broadcast')) {
          await tg('sendMessage', { chat_id: chatId, text: 'Мы уже ждём пост для текущей рассылки. Пришлите текст/фото/видео или отправьте /cancel.' });
          return new Response('ok', { status: 200 });
        }
      } else {
        const post = buildPostFromMessage(msg);
        const sessionId = Date.now().toString(36);
        await writeJSON(store, sessionKey(chatId, sessionId), { post, created_ts: Date.now() });
        await setPointer(store, chatId, { mode: 'confirm', sessionId, last_ping: 0 });
        await sendPostTo(chatId, post);
        await tg('sendMessage', { chat_id: chatId, text: 'Отправить это сообщение всем пользователям?', reply_markup: confirmKeyboard(sessionId) });
        return new Response('ok', { status: 200 });
      }
    }

    // --- если ждём подтверждение
    if (pointer?.mode === 'confirm') {
      if (isCommand) {
        if (text.startsWith('/cancel')) {
          await setPointer(store, chatId, null);
          await tg('sendMessage', { chat_id: chatId, text: 'Рассылка отменена.' });
          return new Response('ok', { status: 200 });
        }
        if (text.startsWith('/broadcast')) {
          await tg('sendMessage', { chat_id: chatId, text: 'Уже на шаге подтверждения. Нажмите «✅ Подтвердить» или «❌ Отменить», либо /cancel.' });
          return new Response('ok', { status: 200 });
        }
      } else {
        const now = Date.now();
        if (!pointer.last_ping || now - Number(pointer.last_ping) > 10_000) {
          await tg('sendMessage', { chat_id: chatId, text: 'Вы уже на шаге подтверждения. Нажмите «✅ Подтвердить отправку» или «❌ Отменить».' });
          await setPointer(store, chatId, { last_ping: now });
        }
        return new Response('ok', { status: 200 });
      }
    }

    // 3) команды администратора
    if (isCommand) {
      if (text.startsWith('/help')) {
        await tg('sendMessage', {
          chat_id: chatId,
          text: [
            'Команды:',
            '/broadcast — начать рассылку (следующее сообщение будет постом).',
            '/cancel — отменить текущую рассылку.',
            '/users — показать число пользователей.',
            '/addme — добавить себя в базу получателей.',
            '/state — показать текущее состояние мастера.',
            '/stats — статистика по Direct Link (Mini App).',
            '/diag set — записать тестовый объект в Blobs.',
            '/diag get — прочитать тестовый объект из Blobs.',
            '/where — показать сайт/окружение/бакет.'
          ].join('\n')
        });
        return new Response('ok', { status: 200 });
      }

      if (text.startsWith('/cancel')) {
        await setPointer(store, chatId, null);
        await tg('sendMessage', { chat_id: chatId, text: 'Состояние сброшено.' });
        return new Response('ok', { status: 200 });
      }

      if (text.startsWith('/users')) {
        const users = await readJSON(store, 'users.json', {});
        await tg('sendMessage', { chat_id: chatId, text: `Пользователей в базе: ${Object.keys(users).length}` });
        return new Response('ok', { status: 200 });
      }

      if (text.startsWith('/addme')) {
        const users = await readJSON(store, 'users.json', {});
        users[chatId] = users[chatId] || {
          first_name: String(msg.from?.first_name || ''),
          last_name : String(msg.from?.last_name  || ''),
          username  : String(msg.from?.username   || ''),
          ts: Date.now(),
        };
        await writeJSON(store, 'users.json', users);
        await tg('sendMessage', { chat_id: chatId, text: 'Добавил вас в список получателей. Проверьте /users.' });
        return new Response('ok', { status: 200 });
      }

      if (text.startsWith('/state')) {
        const p = await getPointer(store, chatId);
        await tg('sendMessage', { chat_id: chatId, text: `state: ${JSON.stringify(p || {}, null, 2)}` });
        return new Response('ok', { status: 200 });
      }

      if (text.startsWith('/diag set')) {
        const payload = { ts: Date.now(), rand: Math.random(), bucket: process.env.BLOB_BUCKET || 'appstore' };
        await writeJSON(store, 'selftest.json', payload);
        await tg('sendMessage', { chat_id: chatId, text: `diag:set ok in bucket "${payload.bucket}"\n${JSON.stringify(payload)}` });
        return new Response('ok', { status: 200 });
      }

      if (text.startsWith('/diag get')) {
        const data = await readJSON(store, 'selftest.json', null);
        await tg('sendMessage', { chat_id: chatId, text: `diag:get from bucket "${process.env.BLOB_BUCKET||'appstore'}"\n${JSON.stringify(data)}` });
        return new Response('ok', { status: 200 });
      }

      if (text.startsWith('/where')) {
        const info = {
          bucket: process.env.BLOB_BUCKET || 'appstore',
          site_url: process.env.URL || '',
          deploy_url: process.env.DEPLOY_URL || '',
          site_name: process.env.SITE_NAME || '',
          context: process.env.CONTEXT || '',
        };
        await tg('sendMessage', { chat_id: chatId, text: `where:\n${JSON.stringify(info, null, 2)}` });
        return new Response('ok', { status: 200 });
      }

      if (text.startsWith('/stats')) {
        // возможно: /stats 30 — окно в 30 дней
        const parts = text.split(/\s+/).filter(Boolean);
        const days = Math.max(1, Math.min(60, Number(parts[1]) || 14)); // от 1 до 60 дней
        const stats = await readJSON(store, STATS_KEY, null);
        const out = stats ? formatStatsText(stats, days, 20) : 'Пока нет данных по открытиям Mini App.';
        await tg('sendMessage', {
          chat_id: chatId,
          text: out,
          disable_web_page_preview: true
        });
        return new Response('ok', { status: 200 });
      }

      if (text.startsWith('/broadcast')) {
        await setPointer(store, chatId, { mode: 'await_post', sessionId: null, last_ping: 0 });
        await tg('sendMessage', {
          chat_id: chatId,
          text: [
            'Ок. Пришлите пост для рассылки:',
            '• текстовый пост',
            '• фото + подпись',
            '• видео + подпись',
            'Кнопки: [Название](https://link)',
            WEBAPP_URL ? 'Автокнопка: «Открыть приложение» откроет WebApp внутри Telegram.' : ''
          ].filter(Boolean).join('\n')
        });
        return new Response('ok', { status: 200 });
      }
    }

    return new Response('ok', { status: 200 });

  } catch (err) {
    try {
      const aid = String(
        update?.callback_query?.from?.id ||
        update?.message?.chat?.id ||
        update?.edited_message?.chat?.id || ''
      );
      if (aid && isAdmin(aid)) {
        await tg('sendMessage', { chat_id: aid, text: `Ошибка: ${String(err?.message || err)}` });
      }
    } catch {}
    return new Response('ok', { status: 200 });
  }
}
