// src/components/Notifications.js
export function renderNotifications(onAfterMarkRead){
  const v = document.getElementById('view');

  const NOTIF_KEY = 'nas_notifications';
  const list = getList().sort((a,b)=> b.ts - a.ts);

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

  // отмечаем все как прочитанные
  const updated = list.map(n=> ({...n, read:true}));
  setList(updated);
  // обновляем бейдж в шапке
  onAfterMarkRead && onAfterMarkRead();

  // иконки
  window.lucide?.createIcons && lucide.createIcons();

  // обработчик «очистить» (можно добавить позже по кнопке)
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
        <div class="note-title">${escapeHtml(n.title)}</div>
        ${n.sub ? `<div class="note-sub">${escapeHtml(n.sub)}</div>` : ''}
      </div>
      <div class="time">${time}</div>
    </div>
  `;
}

function getList(){
  try{ return JSON.parse(localStorage.getItem('nas_notifications') || '[]'); }catch{ return []; }
}
function setList(arr){
  localStorage.setItem('nas_notifications', JSON.stringify(arr));
}
function escapeHtml(s=''){
  return s.replace(/[&<>"']/g, m=> ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}
