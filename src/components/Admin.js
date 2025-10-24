// src/components/Admin.js
import {
  ORDER_STATUSES,
  getOrders,
  acceptOrder,
  cancelOrder,
  updateOrderStatus,
  seedOrdersOnce,
  getStatusLabel,
} from '../core/orders.js';
import { state } from '../core/state.js';
import { priceFmt } from '../core/utils.js';

// ▼ НОВОЕ: клиент к loyalty-функции
import { adminCalc, getBalance, confirmAccrual } from '../core/loyaltyAdmin.js';

/* ====== Константы расчётов (должны совпадать с клиентскими) ====== */
const CASHBACK_RATE_BASE  = 0.05;
const CASHBACK_RATE_BOOST = 0.10; // при условии "первый заказ по реф-ссылке"
const REFERRER_RATE       = 0.05;
const MAX_DISCOUNT_SHARE  = 0.30;
const MAX_REDEEM_POINTS   = 150000;

/* Общая функция: расчёт по заказу — без знания связок рефералов.
   Для дашборда показываем "базовый" расчёт + примечание */
function computeOrderCalc(order){
  const sum = Number(order.total||0);
  const maxRedeemByShare = Math.floor(sum * MAX_DISCOUNT_SHARE);
  const maxRedeem = Math.min(maxRedeemByShare, MAX_REDEEM_POINTS);

  const cbBase  = Math.floor(sum * CASHBACK_RATE_BASE);
  const cbBoost = Math.floor(sum * CASHBACK_RATE_BOOST);
  const refEarn = Math.floor(sum * REFERRER_RATE);

  return {
    sum,
    maxRedeem,
    cashbackBase: cbBase,
    cashbackIfBoost: cbBoost,
    referrerEarnIfLinked: refEarn,
  };
}

export async function renderAdmin(){
  const v = document.getElementById('view');
  seedOrdersOnce();

  document.body.classList.add('admin-mode');

  const TABS = [
    { key:'new',     label:'Новые' },
    { key:'active',  label:'В процессе' },
    { key:'done',    label:'Завершённые' },
  ];

  let tab = 'new';
  let mode = 'list';
  let selectedId = null;

  const getAll = async ()=> {
    const orders = await getOrders();
    state.orders = orders;
    return orders;
  };

  const filterByTab = (list)=>{
    if (tab==='new')    return list.filter(o => o.status==='новый' && !o.accepted);
    if (tab==='active') return list.filter(o => !['новый','выдан','отменён'].includes(o.status));
    if (tab==='done')   return list.filter(o => ['выдан','отменён'].includes(o.status));
    return list;
  };

  const currentProductsMap = ()=>{
    const map = new Map();
    (state.products || []).forEach(p => map.set(String(p.id), p));
    return map;
  };

  function shell(innerHTML){
    v.innerHTML = `
      <section class="section admin-shell">
        <div class="admin-head">
          <div class="admin-title"><i data-lucide="shield-check"></i><span>Админ-панель</span></div>
        </div>

        <div class="admin-tabs" id="adminTabs" role="tablist" aria-label="Статусы заказов">
          ${TABS.map(t=>`
            <button class="admin-tab ${tab===t.key?'is-active':''}" data-k="${t.key}" role="tab" aria-selected="${tab===t.key}">${t.label}</button>
          `).join('')}
        </div>

        ${innerHTML}
      </section>
    `;
    window.lucide?.createIcons && lucide.createIcons();

    document.getElementById('adminTabs')?.addEventListener('click', (e)=>{
      const b = e.target.closest('.admin-tab');
      if(!b) return;
      tab = b.getAttribute('data-k');
      mode = 'list';
      selectedId = null;
      render();
    });
  }

  // ====== СПИСОК ЗАКАЗОВ (мини-карточки) ======
  async function listView(){
    const orders = filterByTab(await getAll());
    const pmap   = currentProductsMap();

    const html = orders.length ? `
      <div class="admin-list-mini" id="adminListMini">
        ${orders.map(o=>{
          const items = Array.isArray(o.cart) ? o.cart : [];
          const itemsCount =
            items.reduce((s,x)=> s + (Number(x.qty)||0), 0) ||
            (o.qty||0) ||
            (items.length || 0);

          const calcSum = items.reduce((s,x)=> s + (Number(x.price)||0) * (Number(x.qty)||0), 0);
          const total   = Number.isFinite(Number(o.total)) ? Number(o.total) : calcSum;
          const totalFmt = priceFmt(total);

          const prod  = pmap.get(String(o.productId));
          const singleTitle = items[0]?.title || prod?.title || 'Товар';
          const nameLineRaw = (items.length > 1 || itemsCount > 1)
            ? `${itemsCount} ${plural(itemsCount, 'товар', 'товара', 'товаров')}`
            : singleTitle;

          return `
            <article class="order-mini" data-id="${o.id}" tabindex="0" role="button" aria-label="Открыть заказ #${o.id}">
              <div class="order-mini__left">
                <div class="order-mini__sum">${totalFmt}</div>
                <div class="muted mini" style="margin-top:4px">${escapeHtml(nameLineRaw)}</div>
                <div class="order-mini__meta">
                  <span class="chip-id">#${escapeHtml(o.id)}</span>
                  <span class="chip-user">@${escapeHtml(o.username||'—')}</span>
                  <span class="muted mini">· ${escapeHtml(getStatusLabel(o.status))}</span>
                </div>
              </div>
              <div class="order-mini__right">
                <i class="arrow" aria-hidden="true"></i>
              </div>
            </article>
          `;
        }).join('')}
      </div>
    ` : `
      <div class="admin-empty">
        <i data-lucide="inbox"></i>
        <div>В этой вкладке пока нет заказов</div>
      </div>
    `;

    shell(html);

    const hook = (card)=>{
      if(!card) return;
      selectedId = card.getAttribute('data-id');
      mode = 'detail';
      render();
    };
    document.getElementById('adminListMini')?.addEventListener('click', (e)=> hook(e.target.closest('.order-mini')));
    document.getElementById('adminListMini')?.addEventListener('keydown', (e)=>{
      if (e.key === 'Enter' || e.key === ' ') {
        const card = e.target.closest('.order-mini');
        if(!card) return;
        e.preventDefault();
        hook(card);
      }
    });
  }

  // ====== Состав заказа (детали) ======
  function itemsBlock(o){
    const items = Array.isArray(o.cart) ? o.cart : [];
    if (!items.length) return `
      <div class="muted" style="margin-top:12px">В заказе нет позиций</div>
    `;

    const rows = items.map((x,i)=>{
      const opts = [
        x.size ? `Размер: ${escapeHtml(x.size)}` : '',
        x.color ? `Цвет: <span title="${escapeHtml(String(x.color))}">${escapeHtml(humanColorName(x.color))}</span>` : '',
      ].filter(Boolean).join(' · ');
      const line = Number(x.qty||0) * Number(x.price||0);
      return `
        <tr>
          <td style="text-align:center">${i+1}</td>
          <td>
            <div class="cart-title" style="font-weight:600">${escapeHtml(x.title||'Товар')}</div>
            ${opts ? `<div class="muted mini">${opts}</div>` : ''}
          </td>
          <td style="text-align:right">${escapeHtml(String(x.qty||0))}</td>
          <td style="text-align:right">${priceFmt(x.price||0)}</td>
          <td style="text-align:right"><b>${priceFmt(line)}</b></td>
        </tr>
      `;
    }).join('');

    return `
      <div class="subsection-title" style="margin-top:14px">Состав заказа</div>
      <div class="table-wrap">
        <table class="size-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Товар</th>
              <th style="text-align:right">Кол-во</th>
              <th style="text-align:right">Цена</th>
              <th style="text-align:right">Сумма</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
          <tfoot>
            <tr>
              <td colspan="4" style="text-align:right">Итого</td>
              <td style="text-align:right"><b>${priceFmt(o.total||0)}</b></td>
            </tr>
          </tfoot>
        </table>
      </div>
    `;
  }

  function calcBlock(o){
    const c = computeOrderCalc(o);
    return `
      <div class="subsection-title" style="margin-top:14px">Дашборд расчётов (базовая модель)</div>
      <div class="table-wrap">
        <table class="size-table">
          <tbody>
            <tr><td>Сумма к оплате</td><td style="text-align:right"><b>${priceFmt(c.sum)}</b></td></tr>
            <tr><td>Максимально можно списать баллами (30%, ≤150к)</td><td style="text-align:right">${priceFmt(c.maxRedeem)}</td></tr>
            <tr><td>Кэшбек (база 5%)</td><td style="text-align:right">+${c.cashbackBase.toLocaleString('ru-RU')} баллов</td></tr>
            <tr><td>Кэшбек при x2 (1-й заказ реферала)</td><td style="text-align:right">+${c.cashbackIfBoost.toLocaleString('ru-RU')} баллов</td></tr>
            <tr><td>Начисление инвайтеру (если есть связка)</td><td style="text-align:right">+${c.referrerEarnIfLinked.toLocaleString('ru-RU')} баллов</td></tr>
          </tbody>
        </table>
      </div>
      <div class="muted mini" style="margin-top:6px">
        Примечание: антифрод блокирует саморефералы, лимитирует 10 новых рефералов/мес и выдаёт кэшбек через 24ч.
      </div>
    `;
  }

  // ▼ НОВОЕ: блок "реальные данные" из loyalty-функции
  function realLoyaltyBlock(o, calc, balance){
    if (!calc) {
      return `
        <div class="subsection-title" style="margin-top:14px">Реальные данные лояльности</div>
        <div class="muted">Нет данных по этому заказу.</div>
      `;
    }
    const usedPts   = Number(calc.usedPoints||0);
    const paidShare = (o.total>0 && usedPts>0) ? Math.round(100*usedPts/Number(o.total)) : 0;
    const refText   = calc.referrer ? `да (инвайтер: <code>${String(calc.referrer)}</code>)` : 'нет';
    const released  = !!calc.pendingReleased;

    return `
      <div class="subsection-title" style="margin-top:14px">Реальные данные лояльности</div>
      <div class="table-wrap">
        <table class="size-table">
          <tbody>
            <tr><td>UID покупателя</td><td style="text-align:right"><code>${String(calc.uid||o.userId||'—')}</code></td></tr>
            <tr><td>Реферальная связка</td><td style="text-align:right">${refText}</td></tr>
            <tr><td>Оплачено баллами</td><td style="text-align:right">−${usedPts.toLocaleString('ru-RU')} баллов${paidShare?` (${paidShare}%)`:''}</td></tr>
            <tr><td>Кэшбек покупателю за этот заказ</td><td style="text-align:right">+${Number(calc.buyerCashback||0).toLocaleString('ru-RU')} баллов</td></tr>
            <tr><td>Бонус инвайтеру</td><td style="text-align:right">+${Number(calc.referrerBonus||0).toLocaleString('ru-RU')} баллов</td></tr>
            <tr><td>Начисления переведены из ожидания</td><td style="text-align:right">${released ? 'да' : 'нет'}</td></tr>
            <tr><td>Баланс покупателя (доступно)</td><td style="text-align:right"><b>${Number(balance?.available||0).toLocaleString('ru-RU')}</b> баллов</td></tr>
            <tr><td>Баланс покупателя (в ожидании)</td><td style="text-align:right">${Number(balance?.pending||0).toLocaleString('ru-RU')} баллов</td></tr>
          </tbody>
        </table>
      </div>
      ${released ? '' : `
        <div class="muted mini" style="margin:8px 0 0">Можно подтвердить начисления вручную, если заказ выдан.</div>
        <button class="btn btn--sm" id="btnConfirmAccrual" data-uid="${String(calc.uid||o.userId)}" data-oid="${String(calc.orderId||o.id)}">
          Подтвердить начисления (pending → available)
        </button>
      `}
    `;
  }

  // ====== Детальная карточка заказа ======
  async function detailView(){
    const orders = await getAll();
    const o = orders.find(x=>String(x.id)===String(selectedId));
    if(!o){
      mode='list';
      return listView();
    }

    // Заголовок
    const items = Array.isArray(o.cart) ? o.cart : [];
    const itemsCount =
      items.reduce((s,x)=> s + (Number(x.qty)||0), 0) ||
      (o.qty||0) ||
      (items.length || 0);
    const calcSum = items.reduce((s,x)=> s + (Number(x.price)||0) * (Number(x.qty)||0), 0);
    const total   = Number.isFinite(Number(o.total)) ? Number(o.total) : calcSum;
    const totalFmt = priceFmt(total);
    const titleText = (items.length > 1 || itemsCount > 1)
      ? `${itemsCount} ${plural(itemsCount, 'товар', 'товара', 'товаров')} · <span class="muted">${totalFmt}</span>`
      : `${escapeHtml(items[0]?.title || 'Товар')} · <span class="muted">${totalFmt}</span>`;

    const isNew  = o.status==='новый' && !o.accepted;
    const isDone = ['выдан','отменён'].includes(o.status);

    // ▼ НОВОЕ: реальные данные лояльности
    let loyaltyCalc = null;
    let buyerBal = null;
    try {
      loyaltyCalc = await adminCalc(o.id);
      buyerBal = await getBalance(loyaltyCalc?.uid || o.userId);
    } catch {
      // игнорируем — покажем пустой блок
    }

    shell(`
      <div class="order-detail">
        <div class="order-detail__top">
          <button id="backToList" class="btn-ghost" aria-label="Назад к списку">
            <i data-lucide="arrow-left"></i><span>Назад</span>
          </button>
          <div class="order-detail__title">${titleText}</div>
        </div>

        <div class="order-detail__body">
          <dl class="kv kv--detail">
            <div class="kv__row">
              <dt>Номер заказа</dt>
              <dd>#${escapeHtml(o.id)}</dd>
            </div>
            <div class="kv__row">
              <dt>Клиент</dt>
              <dd>@${escapeHtml(o.username||'—')}</dd>
            </div>
            <div class="kv__row">
              <dt>Телефон</dt>
              <dd>${escapeHtml(o.phone||'—')}</dd>
            </div>
            <div class="kv__row">
              <dt>Адрес</dt>
              <dd class="break">${escapeHtml(o.address||'—')}</dd>
            </div>
            <div class="kv__row">
              <dt>Плательщик</dt>
              <dd class="break">${escapeHtml(o.payerFullName||'—')}</dd>
            </div>
            <div class="kv__row">
              <dt>Сумма</dt>
              <dd>${priceFmt(o.total||0)}</dd>
            </div>
            <div class="kv__row">
              <dt>Статус</dt>
              <dd>${escapeHtml(getStatusLabel(o.status))}</dd>
            </div>
            ${o.status==='отменён' ? `
              <div class="kv__row">
                <dt>Причина отмены</dt>
                <dd class="break">${escapeHtml(o.cancelReason || '—')}</dd>
              </div>` : ''}
            <div class="kv__row">
              <dt>Чек</dt>
              <dd>
                ${o.paymentScreenshot ? `
                  <div class="receipt-actions">
                    <button class="btn btn--sm btn--outline" data-open="${escapeHtml(o.paymentScreenshot)}">
                      <i data-lucide="external-link"></i><span>&nbsp;Открыть</span>
                    </button>
                    <button class="btn btn--sm btn--primary" data-download="${escapeHtml(o.paymentScreenshot)}" data-oid="${escapeHtml(o.id)}">
                      <i data-lucide="download"></i><span>&nbsp;Скачать</span>
                    </button>
                  </div>
                ` : '—'}
              </dd>
            </div>
          </dl>

          ${calcBlock(o)}
          ${realLoyaltyBlock(o, loyaltyCalc, buyerBal)}
          ${itemsBlock(o)}

          <div class="order-detail__actions">
            ${isNew ? `
              <button class="btn btn--primary" id="btnAccept" data-id="${o.id}">Принять</button>
              <button class="btn btn--outline" id="btnCancel" data-id="${o.id}">Отменить</button>
            ` : ''}

            ${(!isNew && !isDone) ? `
              <div class="stage-list" id="stageList" role="group" aria-label="Этапы заказа">
                ${ORDER_STATUSES.filter(s=>!['новый','отменён'].includes(s)).map(s=>`
                  <button class="stage-btn ${o.status===s?'is-active':''}" data-st="${s}">${getStatusLabel(s)}</button>
                `).join('')}
              </div>
            ` : ''}

            ${isDone?'<span class="muted mini">Заказ завершён</span>':''}
          </div>
        </div>
      </div>
    `);

    window.lucide?.createIcons && lucide.createIcons();

    document.getElementById('backToList')?.addEventListener('click', ()=>{
      mode='list'; selectedId=null; render();
    });

    // чек
    document.querySelector('[data-open]')?.addEventListener('click', (e)=>{
      const url = e.currentTarget.getAttribute('data-open');
      openReceiptPreview(url);
    });
    document.querySelector('[data-download]')?.addEventListener('click', async (e)=>{
      const url = e.currentTarget.getAttribute('data-download');
      const oid = e.currentTarget.getAttribute('data-oid') || 'receipt';
      await triggerDownload(url, suggestReceiptFilename(url, oid));
    });

    // принять
    document.getElementById('btnAccept')?.addEventListener('click', async ()=>{
      await acceptOrder(o.id);
      // форсим обновление списка/вкладок
      mode='detail';
      selectedId = o.id;
      await render();
      try{
        const ev = new CustomEvent('admin:orderAccepted', { detail:{ id: o.id, userId: o.userId } });
        window.dispatchEvent(ev);
      }catch{}
    });

    // отменить
    document.getElementById('btnCancel')?.addEventListener('click', async ()=>{
      const reason = prompt('Причина отмены (будет видна клиенту):');
      await cancelOrder(o.id, reason||'');
      try{
        const ev = new CustomEvent('admin:orderCanceled', { detail:{ id:o.id, reason:reason||'', userId:o.userId } });
        window.dispatchEvent(ev);
      }catch{}
      mode='list'; tab='done'; render();
    });

    // смена этапа
    document.getElementById('stageList')?.addEventListener('click', async (e)=>{
      const btn = e.target.closest('.stage-btn');
      if (!btn) return;
      const st = btn.getAttribute('data-st');
      if (!st) return;
      await updateOrderStatus(o.id, st);

      try{
        const ev = new CustomEvent('admin:statusChanged', { detail:{ id:o.id, status:st, userId:o.userId } });
        window.dispatchEvent(ev);
      }catch{}

      if (st === 'выдан'){ mode='list'; tab='done'; }
      render();
    });

    // ▼ НОВОЕ: ручное подтверждение начислений
    document.getElementById('btnConfirmAccrual')?.addEventListener('click', async (e)=>{
      const uid = e.currentTarget.getAttribute('data-uid');
      const oid = e.currentTarget.getAttribute('data-oid');
      try{
        await confirmAccrual(uid, oid);
        alert('Начисления подтверждены.');
      }catch(err){
        alert('Не удалось подтвердить начисления: ' + (err?.message || err));
      }
      render();
    });
  }

  async function render(){
    if (mode==='detail') await detailView();
    else await listView();
  }

  const rerenderOnOrders = ()=> render();
  window.addEventListener('admin:refresh', rerenderOnOrders);
  window.addEventListener('orders:updated', rerenderOnOrders);

  await render();
}

/* helpers */
function openReceiptPreview(url=''){
  const modal = document.getElementById('modal');
  const mb = document.getElementById('modalBody');
  const mt = document.getElementById('modalTitle');
  const ma = document.getElementById('modalActions');

  if (!modal || !mb || !mt || !ma){
    return safeOpenInNewTab(url);
  }

  mt.textContent = 'Чек оплаты';
  ma.innerHTML = `<button id="rcClose" class="pill">Закрыть</button>
                  <a id="rcDownload" class="pill primary" href="${escapeHtml(url)}" download>Скачать</a>`;

  const isPdf = isProbablyPdf(url);
  mb.innerHTML = isPdf
    ? `
      <div class="receipt-view">
        <div class="receipt-img-wrap" style="aspect-ratio:auto">
          <iframe src="${escapeHtml(url)}" title="Предпросмотр PDF" style="width:100%;height:70vh;border:0;border-radius:12px;background:#f8f8f8"></iframe>
        </div>
      </div>`
    : `
      <div class="receipt-view">
        <div class="receipt-img-wrap">
          <img class="receipt-img" src="${escapeHtml(url)}" alt="Чек оплаты">
        </div>
      </div>`;

  modal.classList.add('show');

  const close = ()=> modal.classList.remove('show');
  document.getElementById('modalClose')?.addEventListener('click', close, { once:true });
  document.getElementById('rcClose')?.addEventListener('click', close, { once:true });

  const onKey = (e)=>{ if (e.key==='Escape'){ close(); window.removeEventListener('keydown', onKey); } };
  window.addEventListener('keydown', onKey);
}

function isProbablyPdf(url=''){
  if (/^data:/i.test(url)) return /^data:application\/pdf/i.test(url);
  try{
    const u = new URL(url, location.href);
    const path = (u.pathname||'').toLowerCase();
    const type = (u.searchParams.get('type')||'').toLowerCase();
    return path.endsWith('.pdf') || type === 'pdf';
  }catch{
    return /\.pdf(\?|$)/i.test(url);
  }
}

function safeOpenInNewTab(url){
  try{ window.open(url, '_blank', 'noopener,noreferrer'); }catch{}
}

async function triggerDownload(url, filename='receipt.jpg'){
  try{
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.rel='noopener'; a.style.display='none';
    document.body.appendChild(a); a.click(); a.remove();
  }catch{
    try{
      const resp = await fetch(url, { mode:'cors' });
      const blob = await resp.blob();
      const ext = extensionFromMime(blob.type) || filename.split('.').pop() || 'jpg';
      const name = ensureExt(filename, ext);
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = blobUrl; a.download = name; a.style.display='none';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(()=> URL.revokeObjectURL(blobUrl), 2000);
    }catch{
      safeOpenInNewTab(url);
    }
  }
}

function suggestReceiptFilename(url, orderId=''){
  if (/^data:/i.test(url)){
    const m = /^data:([^;,]+)/i.exec(url);
    const ext = extensionFromMime(m?.[1] || '') || 'jpg';
    return `receipt_${orderId||'order'}.${ext}`;
  }
  try{
    const u = new URL(url, location.href);
    const last = (u.pathname.split('/').pop() || '').split('?')[0];
    if (last) return last;
  }catch{}
  return `receipt_${orderId||'order'}.jpg`;
}

function extensionFromMime(mime=''){
  const map = { 'image/jpeg':'jpg','image/jpg':'jpg','image/png':'png','image/webp':'webp','image/gif':'gif','image/bmp':'bmp','image/heic':'heic','image/heif':'heif','application/pdf':'pdf' };
  return map[mime.toLowerCase()] || '';
}
function ensureExt(name, ext){
  if (!ext) return name;
  const low = name.toLowerCase();
  if (low.endsWith(`.${ext.toLowerCase()}`)) return name;
  const dot = name.lastIndexOf('.'); const base = dot>0 ? name.slice(0,dot) : name;
  return `${base}.${ext}`;
}
function escapeHtml(s=''){ return String(s).replace(/[&<>"']/g, m=> ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }

// хелпер для склонений: plural(число, 'товар', 'товара', 'товаров')
function plural(n, one, few, many){
  n = Math.abs(n) % 100;
  const n1 = n % 10;
  if (n > 10 && n < 20) return many;
  if (n1 > 1 && n1 < 5) return few;
  if (n1 === 1) return one;
  return many;
}

/* ======== РАСПОЗНАВАНИЕ ЦВЕТА ======== */
/* Показываем понятное название вместо кода/hex/rgb. Возвращает RU-название. */
function humanColorName(value){
  if (!value && value!==0) return '';
  const s = String(value).trim();

  // 1) если уже имя (ru/en) — нормализуем
  const low = s.toLowerCase();
  if (COLOR_EN_RU[low]) return COLOR_EN_RU[low];
  if (COLOR_RU[low]) return COLOR_RU[low];

  // 2) если hex/rgb — переводим в HSL и биндим по диапазонам
  const rgb = parseAnyColorToRgb(s);
  if (!rgb) return s; // не смогли распарсить — показываем как есть
  const { r,g,b } = rgb;
  const { h,l,sat } = rgbToHsl(r,g,b);

  // Серые тона и крайние случаи
  if (sat < 10){
    if (l >= 95) return 'белый';
    if (l <= 8)  return 'чёрный';
    if (l < 30)  return 'тёмно-серый';
    if (l > 75)  return 'светло-серый';
    return 'серый';
  }

  // Коричневый (оранжевый с низкой яркостью)
  if (h >= 10 && h <= 40 && l < 55 && sat > 20) {
    if (l < 30) return 'тёмно-коричневый';
    return 'коричневый';
  }

  const base = hueToRu(h);

  // модификаторы светлоты
  if (l >= 78) return `светло-${base}`;
  if (l <= 22) return `тёмно-${base}`;
  return base;
}

const COLOR_RU = {
  'чёрный':'чёрный','черный':'чёрный','белый':'белый','серый':'серый','красный':'красный','оранжевый':'оранжевый',
  'жёлтый':'жёлтый','желтый':'жёлтый','зелёный':'зелёный','зеленый':'зелёный','голубой':'голубой','синий':'синий',
  'фиолетовый':'фиолетовый','розовый':'розовый','коричневый':'коричневый','бежевый':'бежевый','бирюзовый':'бирюзовый',
  'хаки':'хаки','оливковый':'оливковый','бордовый':'бордовый','индиго':'индиго'
};
const COLOR_EN_RU = {
  'black':'чёрный','white':'белый','gray':'серый','grey':'серый','red':'красный','orange':'оранжевый','yellow':'жёлтый',
  'green':'зелёный','blue':'синий','navy':'тёмно-синий','skyblue':'голубой','cyan':'голубой','teal':'бирюзовый',
  'turquoise':'бирюзовый','purple':'фиолетовый','violet':'фиолетовый','magenta':'пурпурный','pink':'розовый',
  'brown':'коричневый','beige':'бежевый','khaki':'хаки','olive':'оливковый','maroon':'бордовый','indigo':'индиго'
};

/* Парсим hex/rgb/rgba в {r,g,b} */
function parseAnyColorToRgb(str){
  const s = str.trim();

  // hex #rgb, #rrggbb
  const m3 = /^#([0-9a-f]{3})$/i.exec(s);
  if (m3){
    const h = m3[1];
    return {
      r: parseInt(h[0]+h[0],16),
      g: parseInt(h[1]+h[1],16),
      b: parseInt(h[2]+h[2],16),
    };
  }
  const m6 = /^#([0-9a-f]{6})$/i.exec(s);
  if (m6){
    const h = m6[1];
    return {
      r: parseInt(h.slice(0,2),16),
      g: parseInt(h.slice(2,4),16),
      b: parseInt(h.slice(4,6),16),
    };
  }

  // rgb/rgba
  const mrgb = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*[\d.]+\s*)?\)$/i.exec(s);
  if (mrgb){
    return {
      r: clamp255(Number(mrgb[1])),
      g: clamp255(Number(mrgb[2])),
      b: clamp255(Number(mrgb[3])),
    };
  }

  // именованные css — пробуем через словарь, иначе null
  const low = s.toLowerCase();
  if (COLOR_EN_RU[low] || COLOR_RU[low]){
    // вернём null — пусть обработается как уже человекочитаемое имя
    return null;
  }

  return null;
}
function clamp255(n){ n=Math.round(n); if(n<0)return 0; if(n>255)return 255; return n; }
function rgbToHsl(r,g,b){
  r/=255; g/=255; b/=255;
  const max=Math.max(r,g,b), min=Math.min(r,g,b);
  let h, s, l=(max+min)/2;
  if(max===min){ h=0; s=0; }
  else{
    const d=max-min;
    s = l>0.5 ? d/(2-max-min) : d/(max+min);
    switch(max){
      case r: h=(g-b)/d + (g<b?6:0); break;
      case g: h=(b-r)/d + 2; break;
      case b: h=(r-g)/d + 4; break;
    }
    h*=60;
  }
  return { h, s:s*100, l:l*100, sat:s*100 };
}
function hueToRu(h){
  if (h<0) h=0;
  if (h<=15 || h>=345) return 'красный';
  if (h<=35) return 'оранжевый';
  if (h<=60) return 'жёлтый';
  if (h<=85) return 'лаймовый';
  if (h<=165) return 'зелёный';
  if (h<=190) return 'бирюзовый';
  if (h<=210) return 'голубой';
  if (h<=240) return 'синий';
  if (h<=265) return 'индиго';
  if (h<=285) return 'фиолетовый';
  if (h<=320) return 'пурпурный';
  return 'розовый';
}
