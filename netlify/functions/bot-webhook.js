// netlify/functions/bot-webhook.js
// Telegram webhook: рассылка админами ВСЕМ пользователям с предпросмотром,
// подтверждением/отменой и поддержкой медиа (текст/фото/видео).
//
// Флоу:
// 1) Админ -> /broadcast
// 2) Следующее сообщение админа — пост (MarkdownV2).
//    Кнопки указываем markdown-ссылками: [Текст](https://...)
//    Автокнопка "Открыть приложение" (web_app), если задан WEBAPP_URL.
// 3) Бот шлёт предпросмотр и сообщение с кнопками "Подтвердить"/"Отменить".
// 4) По "Подтвердить" — рассылаем всем chat_id из users.json.
//
// ENV:
//   TG_BOT_TOKEN   — токен бота (без "bot")                                [обяз.]
//   ADMIN_CHAT_ID  — chat_id админов через запятую                          [обяз.]
//   WEBAPP_URL     — ссылка WebApp (откроется внутри Telegram)              [опц.]
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

const API = (method) => `https://api.telegram.org/bot${TOKEN}/${method}`;

/* ----------------------- Blobs JSON helpers ----------------------- */
async function readJSON(store, key, fallback = {}) {
  try {
    const data = await store.get(key, { type: 'json' });
    return (data ?? fallback);
  } catch {
    return fallback;
  }
}
async function writeJSON(store, key, obj) {
  const body = JSON.stringify(obj ?? {});
  await store.set(key, body, { contentType: 'application/json; charset=utf-8' });
}

/* ----------------------- Telegram helpers ------------------------- */
async function tg(method, payload) {
  const r = await fetch(API(method), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await r.json().catch(()=> ({}));
  if (!r.ok || data.ok === false) {
    const err = data?.description || `${r.status} ${r.statusText}`;
    throw new Error(`Telegram ${method} failed: ${err}`);
  }
  return data.result;
}
function isAdmin(chatId) {
  return ADMIN_IDS.includes(String(chatId));
}

/* ----------------------- Дедупликация апдейтов -------------------- */
/** Telegram/Netlify иногда присылают один и тот же update повторно.
 * Храним последние 100 update_id и игнорируем дубликаты, чтобы
 * «Ок. пришлите пост…» не отправлялось дважды.
 */
const DEDUPE_KEY = 'updates_dedupe.json';
async function seenUpdate(store, updateId) {
  const bag = await readJSON(store, DEDUPE_KEY, { ids: [] });
  const id = Number(updateId);
  if (!Number.isFinite(id)) return false;
  if (bag.ids.includes(id)) return true;
  bag.ids.push(id);
  if (bag.ids.length > 100) bag.ids = bag.ids.slice(-100);
  await writeJSON(store, DEDUPE_KEY, bag);
  return false;
}

/* -------------------- Кнопки из Markdown + web_app ---------------- */
function parseButtonsFromText(mdText) {
  const text = (mdText || '').trim();
  const linkRe = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
  const buttons = [];
  let m;
  while ((m = linkRe.exec(text)) !== null) {
    buttons.push({ text: m[1], url: m[2] });
  }

  const keyboard = [];
  if (buttons.length) keyboard.push(...buttons.map(b => [b]));
  if (WEBAPP_URL) keyboard.push([{ text: 'Открыть приложение', web_app: { url: WEBAPP_URL } }]);

  return keyboard.length ? { inline_keyboard: keyboard } : undefined;
}

/* -------------------------- Пост из сообщения --------------------- */
function buildPostFromMessage(msg) {
  const hasPhoto = Array.isArray(msg.photo) && msg.photo.length > 0;
  const hasVideo = !!msg.video;

  const caption = (msg.caption || '').trim();
  const text = (msg.text || '').trim();
  const bodyText = hasPhoto || hasVideo ? caption : text;

  const reply_markup = parseButtonsFromText(bodyText);

  if (hasPhoto) {
    const largest = msg.photo[msg.photo.length - 1];
    return {
      type: 'photo',
      payload: {
        photo: largest.file_id,
        caption: bodyText || undefined,
        parse_mode: 'MarkdownV2',
        disable_notification: false,
        reply_markup
      }
    };
  }
  if (hasVideo) {
    return {
      type: 'video',
      payload: {
        video: msg.video.file_id,
        caption: bodyText || undefined,
        parse_mode: 'MarkdownV2',
        disable_notification: false,
        reply_markup
      }
    };
  }
  return {
    type: 'text',
    payload: {
      text: bodyText || ' ',
      parse_mode: 'MarkdownV2',
      disable_web_page_preview: true,
      disable_notification: false,
      reply_markup
    }
  };
}

/* ---------------------- Отправка поста адресату ------------------- */
async function sendPostTo(chatId, post) {
  const p = post?.payload || {};
  if (post.type === 'photo') return tg('sendPhoto',  { chat_id: chatId, ...p });
  if (post.type === 'video') return tg('sendVideo',  { chat_id: chatId, ...p });
  return tg('sendMessage', { chat_id: chatId, ...p });
}

/* ---------------------- Массовая рассылка ------------------------- */
async function broadcastToAllUsers({ store, post }) {
  const users = await readJSON(store, 'users.json', {});
  const ids = Object.keys(users); // uid == chat_id
  if (!ids.length) {
    return { total: 0, ok: 0, fail: 0 };
  }

  const CHUNK = 25;
  const PAUSE_MS = 450;
  const results = { total: ids.length, ok: 0, fail: 0 };

  for (let i = 0; i < ids.length; i += CHUNK) {
    const slice = ids.slice(i, i + CHUNK);
    const batch = slice.map(uid =>
      sendPostTo(uid, post)
        .then(() => { results.ok++; })
        .catch(() => { results.fail++; })
    );
    await Promise.all(batch);
    if (i + CHUNK < ids.length) {
      await new Promise(r => setTimeout(r, PAUSE_MS));
    }
  }
  return results;
}

/* --------------------- Состояние мастера-рассылки ------------------ */
async function setAdminState(store, adminId, state) {
  const key = 'broadcast_state.json';
  const st = await readJSON(store, key, {});
  if (state === null) delete st[adminId];
  else st[adminId] = state;
  await writeJSON(store, key, st);
}
async function getAdminState(store, adminId) {
  const key = 'broadcast_state.json';
  const st = await readJSON(store, key, {});
  return st[adminId] || null;
}
function confirmKeyboard() {
  return {
    inline_keyboard: [
      [{ text: '✅ Подтвердить отправку', callback_data: 'bc_confirm' }],
      [{ text: '❌ Отменить',           callback_data: 'bc_cancel'  }]
    ]
  };
}

/* ============================ ВЕБХУК ============================== */
export default async function handler(req) {
  // Telegram шлёт только POST
  if (req.method !== 'POST') {
    return new Response('ok', { status: 200 });
  }

  const store = getStore(process.env.BLOB_BUCKET || 'appstore');

  let update;
  try { update = await req.json(); }
  catch { return new Response('bad json', { status: 200 }); }

  // анти-дубликаты
  const updId = update?.update_id;
  if (await seenUpdate(store, updId)) {
    // уже обрабатывали этот апдейт — молча подтверждаем
    return new Response('ok', { status: 200 });
  }

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
      const st = await getAdminState(store, fromId);
      if (!st?.mode || !st?.post) {
        await tg('answerCallbackQuery', { callback_query_id: cq.id, text: 'Нет активной рассылки' });
        return new Response('ok', { status: 200 });
      }

      if (data === 'bc_cancel') {
        await setAdminState(store, fromId, null);
        await tg('answerCallbackQuery', { callback_query_id: cq.id, text: 'Отменено' });
        await tg('sendMessage', { chat_id: fromId, text: 'Рассылка отменена.' });
        return new Response('ok', { status: 200 });
      }

      if (data === 'bc_confirm') {
        await tg('answerCallbackQuery', { callback_query_id: cq.id, text: 'Отправляем…' });

        const res = await broadcastToAllUsers({ store, post: st.post });
        await setAdminState(store, fromId, null);

        if (res.total === 0) {
          await tg('sendMessage', {
            chat_id: fromId,
            text: 'В базе пользователей пока никого нет. Никому отправлять.'
          });
        } else {
          await tg('sendMessage', {
            chat_id: fromId,
            text: `Готово: всего ${res.total}, отправлено ${res.ok}, ошибок ${res.fail}.`
          });
        }
        return new Response('ok', { status: 200 });
      }

      await tg('answerCallbackQuery', { callback_query_id: cq.id, text: 'Неизвестное действие' });
      return new Response('ok', { status: 200 });
    }

    /* ---------- B) обычные сообщения (личка) ---------- */
    const msg = update.message || update.edited_message;
    if (!msg) return new Response('ok', { status: 200 });

    const chatId = String(msg.chat?.id || '');
    if (!isAdmin(chatId)) {
      // молча игнорируем не-админов
      return new Response('ok', { status: 200 });
    }

    const text = (msg.text || msg.caption || '').trim();

    // /broadcast — переход в режим ожидания поста
    if (text && msg.text && text.startsWith('/broadcast')) {
      await setAdminState(store, chatId, { mode: 'await_post' });
      await tg('sendMessage', {
        chat_id: chatId,
        text: [
          'Ок. Пришлите пост для рассылки (как в PostBot).',
          'Варианты:',
          '• текстовый пост',
          '• фото + подпись',
          '• видео + подпись',
          'Кнопки: [Название](https://link)',
          WEBAPP_URL ? 'Автокнопка: «Открыть приложение» откроет WebApp внутри Telegram.' : ''
        ].filter(Boolean).join('\n')
      });
      return new Response('ok', { status: 200 });
    }

    // Если ждём пост — этот апдейт и есть пост (текст/фото/видео)
    const st = await getAdminState(store, chatId);
    if (st?.mode === 'await_post') {
      const post = buildPostFromMessage(msg);

      // Предпросмотр тем же типом
      await sendPostTo(chatId, post);

      // Сообщение с кнопками подтверждения
      await tg('sendMessage', {
        chat_id: chatId,
        text: 'Отправить это сообщение всем пользователям?',
        reply_markup: confirmKeyboard()
      });

      await setAdminState(store, chatId, { mode: 'confirm', post });
      return new Response('ok', { status: 200 });
    }

    // Уже на шаге подтверждения — напоминаем нажать кнопку
    if (st?.mode === 'confirm') {
      await tg('sendMessage', {
        chat_id: chatId,
        text: 'Вы уже на шаге подтверждения. Нажмите «✅ Подтвердить отправку» или «❌ Отменить».'
      });
      return new Response('ok', { status: 200 });
    }

    // Хелп по умолчанию
    await tg('sendMessage', {
      chat_id: chatId,
      text: [
        'Команда для рассылки всем пользователям:',
        '/broadcast — затем пришлите текст/фото/видео с подписью (MarkdownV2).',
        'Кнопки: [Название](https://link).',
        WEBAPP_URL ? 'Автокнопка: «Открыть приложение» — web_app, откроет приложение внутри Telegram.' : ''
      ].filter(Boolean).join('\n')
    });
    return new Response('ok', { status: 200 });
  } catch (err) {
    // Поймали ошибку — если это админ, попробуем сообщить
    try {
      const aid =
        String(update?.callback_query?.from?.id || update?.message?.chat?.id || '');
      if (aid && isAdmin(aid)) {
        await tg('sendMessage', {
          chat_id: aid,
          text: `Ошибка: ${String(err?.message || err)}`
        });
      }
    } catch {}
    // Но Telegram ждёт 200 — иначе он ретраит (и будет дубль)
    return new Response('ok', { status: 200 });
  }
}
