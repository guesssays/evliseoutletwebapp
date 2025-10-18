// src/components/Notifications.js
import { k } from '../core/state.js';

export function renderNotifications(onAfterMarkRead){
  const v = document.getElementById('view');

  const list = getList().sort((a,b)=> (b.ts||0) - (a.ts||0));

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

  // отмечаем все как прочитанные (только если были непрочитанные)
  if (list.some(n=>!n.read)){
    const updated = list.map(n=> ({...n, read:true}));
    setList(updated);
    onAfterMarkRead && onAfterMarkRead();
  }

  // иконки
  window.lucide?.createIcons && lucide.createIcons();
}

function noteTpl(n){
  const icon = n.icon || 'bell';
  const d = new Date(n.ts || Date.now());
  const hh = String(d.getHours()).padStart(2,'0');
  const mm = String(d.getMinutes()).padStart(2,'0');
  const time = `${hh}:${mm}`;
  return `
    <div class="note" data-id="${n.id}">
      <i data-lucide="${icon}"></i>
      <div>
        <div class="note-title">${escapeHtml(n.title || '')}</div>
        ${n.sub ? `<div class="note-sub">${escapeHtml(n.sub)}</div>` : ''}
      </div>
      <div class="time">${time}</div>
    </div>
  `;
}

/* ===== per-user storage (через k()) ===== */
const KEY = 'nas_notifications';
function getList(){
  try{ return JSON.parse(localStorage.getItem(k(KEY)) || '[]'); }catch{ return []; }
}
function setList(arr){
  localStorage.setItem(k(KEY), JSON.stringify(Array.isArray(arr)?arr:[]));
}

function escapeHtml(s=''){
  return s.replace(/[&<>"']/g, m=> ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}
