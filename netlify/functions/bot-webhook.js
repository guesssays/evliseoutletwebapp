// netlify/functions/bot-webhook.js
// Бот: рассылка /broadcast (текст/фото/видео) с предпросмотром и подтверждением,
// учёт пользователей, web_app-кнопка, устойчивая машина состояний и анти-дубли.
// Диагностика: /diag set, /diag get, /where, /users, /state, /cancel, /addme
//
// ENV:
//   TG_BOT_TOKEN   — токен бота (без "bot")                                [обяз.]
//   ADMIN_CHAT_ID  — chat_id админов через запятую                          [обяз.]
//   WEBAPP_URL     — ссылка WebApp (внутри Telegram)                         [опц.]
//   BLOB_BUCKET    — имя стора Netlify Blobs (по умолчанию 'appstore')

import { getStore } from '@netlify/blobs';

const TOKEN = process.env.TG_BOT_TOKEN || '';
const WEBAPP_URL = process.env.WEBAPP_URL || '';
if (!TOKEN) throw new Error('TG_BOT_TOKEN is required');

function admins() {
  const rawEnv = (process.env.ADMIN_CHAT_ID ?? '').toString();
  return rawEnv.split(',').map(s => s.trim()).filter(Boolean);
}
const ADMIN_IDS = admins();

const API = (m) => `https://api.telegram.org/bot${TOKEN}/${m}`;

/* -------- Blobs helpers (универсально для Netlify runtimes) -------- */
async function readJSON(store, key, fallback = {}) {
  try { const v = await store.get(key, { type:'json' }); return v ?? fallback; }
  catch { return fallback; }
}
async function writeJSON(store, key, obj) {
  await store.set(key, JSON.stringify(obj ?? {}), { contentType:'application/json' });
}

/* ----------------------- Telegram helpers -------------------- */
async function tg(method, payload) {
  const r = await fetch(API(method), {
    method: 'POST',
    headers: { 'Content-Type':'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await r.json().catch(()=> ({}));
  if (!r.ok || data.ok === false) {
    const err = data?.description || `${r.status} ${r.statusText}`;
    throw new Error(`Telegram ${method} failed: ${err}`);
  }
  return data.result;
}
const isAdmin = (id) => ADMIN_IDS.includes(String(id));

/* --------- безопасная отправка: MarkdownV2 → фолбэк --------- */
async function safeSend(method, base) {
  try {
    return await tg(method, base);
  } catch (e) {
    const msg = String(e?.message || '');
    if (msg.includes('parse entities') || msg.includes('Wrong entity')) {
      const clone = { ...base }; delete clone.parse_mode;
      return tg(method, clone);
    }
    throw e;
  }
}

/* ----------------------- Анти-дубли update_id ---------------- */
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

/* -------------------- Регистрация пользователя --------------- */
async function upsertUserAndMaybeNotify(store, from) {
  const uid = String(from?.id || '').trim();
  if (!uid) return;
  const users = await readJSON(store, 'users.json', {});
  const existed = !!users[uid];
  users[uid] = {
    first_name: String(from.first_name || '').trim(),
    last_name : String(from.last_name  || '').trim(),
    username  : String(from.username   || '').trim(),
    ts: users[uid]?.ts || Date.now()
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

/* -------------------- Кнопки из Markdown + web_app ----------- */
function parseButtonsFromText(mdText) {
  const text = (mdText || '').trim();
  const linkRe = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
  const buttons = [];
  let m; while ((m = linkRe.exec(text)) !== null) buttons.push({ text: m[1], url: m[2] });

  const kb = [];
  if (buttons.length) kb.push(...buttons.map(b => [b]));
  if (WEBAPP_URL) kb.push([{ text: 'Открыть приложение', web_app: { url: WEBAPP_URL } }]);
  return kb.length ? { inline_keyboard: kb } : undefined;
}

/* -------------------------- Пост из сообщения ---------------- */
function buildPostFromMessage(msg) {
  const hasPhoto = Array.isArray(msg.photo) && msg.photo.length > 0;
  const hasVideo = !!msg.video;

  const caption = (msg.caption || '').trim();
  const text = (msg.text || '').trim();
  const bodyText = hasPhoto || hasVideo ? caption : text;
  const reply_markup = parseButtonsFromText(bodyText);

  if (hasPhoto) {
    const largest = msg.photo[msg.photo.length - 1];
    return { type: 'photo', payload: { photo: largest.file_id, caption: bodyText || undefined, parse_mode: 'MarkdownV2', disable_notification: false, reply_markup } };
  }
  if (hasVideo) {
    return { type: 'video', payload: { video: msg.video.file_id, caption: bodyText || undefined, parse_mode: 'MarkdownV2', disable_notification: false, reply_markup } };
  }
  return { type: 'text', payload: { text: bodyText || ' ', parse_mode: 'MarkdownV2', disable_web_page_preview: true, disable_notification: false, reply_markup } };
}

/* ---------------------- Отправка поста адресату -------------- */
async function sendPostTo(chatId, post) {
  const p = post?.payload || {};
  if (post.type === 'photo') return safeSend('sendPhoto',  { chat_id: chatId, ...p });
  if (post.type === 'video') return safeSend('sendVideo',  { chat_id: chatId, ...p });
  return safeSend('sendMessage', { chat_id: chatId, ...p });
}

/* ---------------------- Массовая рассылка -------------------- */
async function broadcastToAllUsers({ store, post }) {
  const users = await readJSON(store, 'users.json', {});
  const ids = Object.keys(users);
  if (!ids.length) return { total: 0, ok: 0, fail: 0 };

  const CHUNK = 25, PAUSE_MS = 450;
  const res = { total: ids.length, ok: 0, fail: 0 };

  for (let i = 0; i < ids.length; i += CHUNK) {
    const slice = ids.slice(i, i + CHUNK);
    await Promise.all(slice.map(uid =>
      sendPostTo(uid, post).then(()=>{res.ok++;}).catch(()=>{res.fail++;})
    ));
    if (i + CHUNK < ids.length) await new Promise(r => setTimeout(r, PAUSE_MS));
  }
  return res;
}

/* --------------------- Состояние мастера-рассылки ------------- */
async function setAdminState(store, adminId, patch) {
  const key = 'broadcast_state.json';
  const st = await readJSON(store, key, {});
  if (patch === null) delete st[adminId];
  else st[adminId] = { ...(st[adminId]||{}), ...patch };
  await writeJSON(store, key, st);
}
async function getAdminState(store, adminId) {
  const st = await readJSON(store, 'broadcast_state.json', {});
  return st[adminId] || null;
}
const confirmKeyboard = () => ({
  inline_keyboard: [
    [{ text: '✅ Подтвердить отправку', callback_data: 'bc_confirm' }],
    [{ text: '❌ Отменить',             callback_data: 'bc_cancel'  }]
  ]
});

/* ============================ ВЕБХУК ========================== */
export default async function handler(req) {
  if (req.method !== 'POST') return new Response('ok', { status: 200 });

  const store = getStore(process.env.BLOB_BUCKET || 'appstore');

  let update;
  try { update = await req.json(); } catch { return new Response('ok', { status: 200 }); }

  // глобальный анти-дубль
  if (await seenUpdate(store, update?.update_id)) return new Response('ok', { status: 200 });

  try {
    /* ---------- A) callback_query: подтверждение/отмена ---------- */
    if (update.callback_query) {
      const cq = update.callback_query;
      const fromId = String(cq.from?.id || '');
      const data = cq.data || '';

      if (!isAdmin(fromId)) {
        await tg('answerCallbackQuery', { callback_query_id: cq.id, text: 'Недостаточно прав' });
        return new Response('ok', { status: 200 });
      }

      // читаем состояние; даже если не нашли — мягко сбрасываем (устойчиво к eventual consistency)
      const st = await getAdminState(store, fromId);

      if (data === 'bc_cancel') {
        await setAdminState(store, fromId, null);
        await tg('answerCallbackQuery', { callback_query_id: cq.id, text: 'Отменено' });
        await tg('sendMessage', { chat_id: fromId, text: 'Рассылка отменена.' });
        return new Response('ok', { status: 200 });
      }

      if (data === 'bc_confirm') {
        if (!st?.post) {
          await tg('answerCallbackQuery', { callback_query_id: cq.id, text: 'Состояние не найдено, попробуйте ещё раз' });
          return new Response('ok', { status: 200 });
        }
        await tg('answerCallbackQuery', { callback_query_id: cq.id, text: 'Отправляем…' });
        const res = await broadcastToAllUsers({ store, post: st.post });
        await setAdminState(store, fromId, null);
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

    /* ---------- B) обычные/отредактированные сообщения ---------- */
    const msgRaw = update.message || update.edited_message;
    if (!msgRaw) return new Response('ok', { status: 200 });

    const chatId = String(msgRaw.chat?.id || '');
    const text = (msgRaw.text || msgRaw.caption || '').trim();

    // --- 1) не-админы: регистрация и /start
    if (!isAdmin(chatId)) {
      await upsertUserAndMaybeNotify(store, msgRaw.from);
      if (text?.startsWith('/start')) {
        await tg('sendMessage', {
          chat_id: chatId,
          text: 'Привет! Это бот EVLISE OUTLET. Откройте приложение кнопкой ниже.',
          reply_markup: WEBAPP_URL
            ? { inline_keyboard: [[{ text: 'Открыть приложение', web_app: { url: WEBAPP_URL } }]] }
            : undefined
        });
      }
      return new Response('ok', { status: 200 });
    }

    // --- 2) Если ждём пост — обрабатываем его ПЕРЕД командами
    {
      const st = await getAdminState(store, chatId);
      const updId = Number(update.update_id || 0);

      if (st?.mode === 'await_post') {
        // защита от дубля для этого админа
        if (st.last_update && updId && updId <= Number(st.last_update)) {
          return new Response('ok', { status: 200 });
        }

        // если прислали команду — не считаем это постом
        const isCommand = !!(msgRaw.text && msgRaw.text.startsWith('/'));
        if (isCommand) {
          if (text.startsWith('/cancel')) {
            await setAdminState(store, chatId, null);
            await tg('sendMessage', { chat_id: chatId, text: 'Рассылка отменена.' });
            return new Response('ok', { status: 200 });
          }
          if (text.startsWith('/broadcast')) {
            await tg('sendMessage', { chat_id: chatId, text: 'Мы уже ждём пост для текущей рассылки. Пришлите текст/фото/видео или отправьте /cancel.' });
            return new Response('ok', { status: 200 });
          }
          // другие команды игнорируем, чтобы не путать мастера
          return new Response('ok', { status: 200 });
        }

        // нормальный пост
        const post = buildPostFromMessage(msgRaw);
        await sendPostTo(chatId, post); // предпросмотр
        await tg('sendMessage', {
          chat_id: chatId,
          text: 'Отправить это сообщение всем пользователям?',
          reply_markup: confirmKeyboard()
        });
        await setAdminState(store, chatId, { mode: 'confirm', post, last_update: updId });
        return new Response('ok', { status: 200 });
      }

      if (st?.mode === 'confirm') {
        await setAdminState(store, chatId, { last_update: updId });
        await tg('sendMessage', { chat_id: chatId, text: 'Вы уже на шаге подтверждения. Нажмите «✅ Подтвердить отправку» или «❌ Отменить».' });
        return new Response('ok', { status: 200 });
      }
    }

    // --- 3) Админ-команды (когда ничего не ждём)
    if (update.message && msgRaw.text) {
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
            '/diag set — записать тестовый объект в Blobs.',
            '/diag get — прочитать тестовый объект из Blobs.',
            '/where — показать сайт/окружение/бакет.'
          ].join('\n')
        });
        return new Response('ok', { status: 200 });
      }

      if (text.startsWith('/cancel')) {
        await setAdminState(store, chatId, null);
        await tg('sendMessage', { chat_id: chatId, text: 'Состояние сброшено.' });
        return new Response('ok', { status: 200 });
      }

      if (text.startsWith('/users')) {
        const users = await readJSON(store, 'users.json', {});
        await tg('sendMessage', { chat_id: chatId, text: `Пользователей в базе: ${Object.keys(users).length}` });
        return new Response('ok', { status: 200 });
      }

      // ⬇️ Добавлено: быстрый способ включить себя в рассылку
      if (text.startsWith('/addme')) {
        const users = await readJSON(store, 'users.json', {});
        users[chatId] = users[chatId] || {
          first_name: String(msgRaw.from?.first_name||''),
          last_name : String(msgRaw.from?.last_name||''),
          username  : String(msgRaw.from?.username||''),
          ts: Date.now(),
        };
        await writeJSON(store, 'users.json', users);
        await tg('sendMessage', { chat_id: chatId, text: 'Добавил вас в список получателей. Проверьте /users.' });
        return new Response('ok', { status: 200 });
      }

      if (text.startsWith('/state')) {
        const st = await getAdminState(store, chatId);
        await tg('sendMessage', { chat_id: chatId, text: `state: ${JSON.stringify(st || {}, null, 2)}` });
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

      if (text.startsWith('/broadcast')) {
        await setAdminState(store, chatId, { mode: 'await_post', post: null, last_update: 0 });
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

    // по умолчанию — молчим
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
