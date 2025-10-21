// src/views/RefBridge.js
import { BOT_USERNAME } from '../core/loyalty.js';

export function renderRefBridge(){
  const v = document.getElementById('view');
  const params = new URLSearchParams(location.hash.split('?')[1] || '');
  const start = params.get('start') || '';
  const inviter = params.get('ref') || (start.startsWith('ref_') ? start.slice(4) : '');

  const startParam = start || (inviter ? `ref_${inviter}` : '');
  const tgUrl = `https://t.me/${BOT_USERNAME}?start=${encodeURIComponent(startParam)}`;
  const tgNative = `tg://resolve?domain=${BOT_USERNAME}&start=${encodeURIComponent(startParam)}`;

  v.innerHTML = `
    <section class="section">
      <div class="section-title">Реферальная ссылка</div>
      <p class="muted">Откройте ссылку в Telegram, чтобы бонусы были зачислены автоматически.</p>
      <div style="display:flex;gap:10px;margin-top:10px">
        <a class="pill primary" href="${tgUrl}">Открыть в Telegram</a>
        <a class="pill" href="${tgUrl}" target="_blank" rel="noopener">Открыть в браузере</a>
      </div>
      <p class="mini muted" style="margin-top:8px">Если Telegram не открылся — нажмите «Открыть в Telegram» ещё раз.</p>
    </section>
  `;

  // Пассивная попытка открыть нативный клиент Telegram
  try{
    const a = document.createElement('a');
    a.href = tgNative;
    document.body.appendChild(a);
    a.click();
    setTimeout(()=>a.remove(), 400);
  }catch{}
}
