// src/components/Notifications.js
import { k, getUID, getNotifications as getList, setNotifications as setList } from '../core/state.js';

const ENDPOINT = '/.netlify/functions/notifs';
const FETCH_TIMEOUT_MS = 10000;

/* ===== Общий таймаут (как в других модулях) ===== */
function withTimeout(promise, ms = FETCH_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(
      v => { clearTimeout(t); resolve(v); },
      e => { clearTimeout(t); reject(e); }
    );
  });
}

// Берём сырой initData из Telegram Mini App, чтобы сервер смог верифицировать владельца.
function getTgInitDataRaw(){
  try {
    return typeof window?.Telegram?.WebApp?.initData === 'string'
      ? window.Telegram.WebApp.initData
      : '';
  } catch {
    return '';
  }
}

/* ===== badge helpers ===== */
function unreadCount(list){ return (list||[]).reduce((a,n)=> a + (!n.read ? 1 : 0), 0); }
function updateUnreadBadge(n){
  const v = Math.max(0, n|0);
  // общий локальный счётчик (если где-то читается напрямую)
  localStorage.setItem(k('notifs_unread'), String(v));
  // событие для шапки/иконок (перехватывается в main.js → updateNotifBadge)
  try { window.dispatchEvent(new CustomEvent('notifs:unread', { detail: v })); } catch {}
}

export async function renderNotifications(onAfterMarkRead){
  const v = document.getElementById('view');
  if (!v) return;

  // 1) грузим с сервера (fall back на локальное)
  let list = await fetchServerListSafe().catch(()=>null);
  if (!Array.isArray(list)) list = getList();

  // сортировка на всякий случай
  list = list.slice().sort((a,b)=> (b.ts||0) - (a.ts||0));

  if (!list.length){
    v.innerHTML = `
      <div class="section-title">Уведомления</div>
      <div class="notes-empty">Пока нет уведомлений. Мы сообщим, когда появятся новости или акции.</div>
    `;
  }else{
    v.innerHTML = `
      <div class="section-title">Уведомления</div>
      <section class="notes">
        ${list.map(n=> noteTpl(n)).join('')}
      </section>
    `;
  }

  // 2) отмечаем прочитанными: сперва сервер, затем локальный кэш
  const serverItems = await markAllServerSafe().catch(()=>null);
  if (Array.isArray(serverItems)) {
    // сервер – источник истины, даже если вернул []
    const norm = serverItems.map(n => normalize(n));
    setList(norm.sort((a,b)=> (b.ts||0)-(a.ts||0)));
  } else {
    // оффлайн-фолбэк
    const updated = list.map(n => ({ ...n, read: true }));
    setList(updated);
  }
  updateUnreadBadge(0);
  onAfterMarkRead && onAfterMarkRead();

  // иконки
  window.lucide?.createIcons && lucide.createIcons();
}

function noteTpl(n){
  const icon = n.icon || 'bell';
  const d = new Date(n.ts || Date.now());
  // Показ локального времени пользователя; fallback на HH:MM
  const time = d.toLocaleTimeString?.([], { hour:'2-digit', minute:'2-digit' }) ||
               `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  return `
    <div class="note ${n.read ? 'is-read' : ''}" data-id="${escapeAttr(n.id)}">
      <i data-lucide="${escapeAttr(icon)}"></i>
      <div>
        <div class="note-title">${escapeHtml(n.title || '')}</div>
        ${n.sub ? `<div class="note-sub">${escapeHtml(n.sub)}</div>` : ''}
      </div>
      <div class="time">${escapeHtml(time)}</div>
    </div>
  `;
}

function normalize(n){
  return {
    id: String(n.id || Date.now()),
    ts: Number(n.ts || Date.now()),
    read: !!n.read,
    icon: String(n.icon || 'bell'),
    title: String(n.title || ''),
    sub: String(n.sub || ''),
  };
}

/* ===== server API ===== */
async function fetchServerListSafe(){
  const uid = getUID();
  if (!uid) return null;
  try{
    const r = await withTimeout(fetch(`${ENDPOINT}?op=list&uid=${encodeURIComponent(uid)}&ts=${Date.now()}`, {
      method:'GET',
      headers:{ 'X-Tg-Init-Data': getTgInitDataRaw(), 'Cache-Control':'no-store' }
    }));
    const j = await r.json().catch(()=> ({}));
    if (!r.ok || j?.ok === false) return null;
    const items = Array.isArray(j.items) ? j.items : [];
    const norm = items.map(normalize);
    setList(norm);

    return norm;
  }catch{
    return null;
  }
}

async function markAllServerSafe(){
  const uid = getUID();
  if (!uid) return null;

  const initData = getTgInitDataRaw();
  const hasInit = !!(initData && initData.length);

  try{
    const headers = {
      'Content-Type':'application/json',
      ...(hasInit ? { 'X-Tg-Init-Data': initData } : {}),
    };
    const attempts = hasInit
      ? [ { op:'markmine' }, { op:'markseen' } ]   // ← без uid при initData
      : [ { op:'markAll', uid } ];                 // ← uid только в публичном пути

    for (const body of attempts){
      const r = await withTimeout(fetch(ENDPOINT, {
        method:'POST',
        headers,
        body: JSON.stringify(body),
      }));
      const j = await r.json().catch(()=> ({}));
      if (r.ok && j?.ok !== false){
        return Array.isArray(j.items) ? j.items : null;
      }
    }
    return null;
  }catch{
    return null;
  }
}

/* ===== helpers ===== */
function escapeHtml(s=''){
  return String(s)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#39;');
}
function escapeAttr(s=''){ return escapeHtml(String(s)); }
