// src/components/Admin.js
import {
  ORDER_STATUSES,
  getOrders,
  acceptOrder,
  cancelOrder,
  updateOrderStatus,
  seedOrdersOnce
} from '../core/orders.js';
import { state } from '../core/state.js';
import { priceFmt } from '../core/utils.js';

/**
 * Админка:
 * - Вкладки: Новые / В процессе / Завершённые
 * - Новый: только «Принять» и «Отменить» (с комментарием)
 * - В процессе: выбор этапа через стилизованные пилюли
 * - Если статус «выдан» → в «Завершённые»
 * - Бейджи статусов убраны
 */

const CANCEL_STORE_KEY = 'nas_cancel_reasons';

function loadCancelReasons(){
  try{ return JSON.parse(localStorage.getItem(CANCEL_STORE_KEY) || '{}'); }catch{ return {}; }
}
function saveCancelReason(orderId, text=''){
  const map = loadCancelReasons();
  map[String(orderId)] = String(text||'');
  localStorage.setItem(CANCEL_STORE_KEY, JSON.stringify(map));
}
function getCancelReason(orderId){
  const map = loadCancelReasons();
  return map[String(orderId)] || '';
}

export function renderAdmin(){
  const v = document.getElementById('view');
  seedOrdersOnce();

  // прячем клиентский таббар для режима админа
  document.body.classList.add('admin-mode');

  const TABS = [
    { key:'new',     label:'Новые' },
    { key:'active',  label:'В процессе' },
    { key:'done',    label:'Завершённые' },
  ];

  // локальное состояние экрана админки
  let tab = 'new';
  let mode = 'list';     // 'list' | 'detail'
  let selectedId = null; // id текущего заказа в detail

  // ---------- helpers ----------
  const getAll = ()=> {
    const orders = getOrders();
    state.orders = orders;
    return orders;
  };

  // фильтрация по вкладкам согласно ТЗ
  const filterByTab = (list)=>{
    if (tab==='new')    return list.filter(o => o.status==='новый' && !o.accepted);
    if (tab==='active') return list.filter(o => !['новый','выдан','отменён'].includes(o.status));
    if (tab==='done')   return list.filter(o => ['выдан','отменён'].includes(o.status));
    return list;
  };

  const getById = (id)=> getAll().find(o=>String(o.id)===String(id));

  const currentProductsMap = ()=>{
    const map = new Map();
    (state.products || []).forEach(p => map.set(String(p.id), p));
    return map;
  };

  // допустимые этапы для «в процессе»
  const ACTIVE_STAGES = ORDER_STATUSES.filter(s => !['новый','отменён'].includes(s));

  // ---------- UI shells ----------
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

  function listView(){
    const orders = filterByTab(getAll());
    const pmap   = currentProductsMap();

    const html = orders.length ? `
      <div class="admin-list-mini" id="adminListMini">
        ${orders.map(o=>{
          const prod  = pmap.get(String(o.productId));
          const price = prod?.price ? priceFmt(prod.price) : (o.total ? priceFmt(o.total) : '—');
          return `
            <article class="order-mini" data-id="${o.id}" tabindex="0" role="button" aria-label="Открыть заказ #${o.id}">
              <div class="order-mini__left">
                <div class="order-mini__sum">${price}</div>
                <div class="order-mini__meta">
                  <span class="chip-id">#${escapeHtml(o.id)}</span>
                  <span class="chip-user">@${escapeHtml(o.username||'—')}</span>
                  <span class="muted mini">· ${escapeHtml(humanStatus(o.status))}</span>
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

  function detailView(){
    const o = getById(selectedId);
    if(!o){
      mode='list';
      return listView();
    }
    const pmap   = currentProductsMap();
    const prod   = pmap.get(String(o.productId));
    const price  = prod?.price ? priceFmt(prod.price) : (o.total ? priceFmt(o.total) : '—');
    const title  = prod?.title ? `${prod.title} ${price ? `· <span class="muted">${price}</span>`:''}` : `Заказ #${o.id}`;
    const isNew  = o.status==='новый' && !o.accepted;
    const isDone = ['выдан','отменён'].includes(o.status);

    shell(`
      <div class="order-detail">
        <div class="order-detail__top">
          <button id="backToList" class="btn-ghost" aria-label="Назад к списку">
            <i data-lucide="arrow-left"></i><span>Назад</span>
          </button>
          <div class="order-detail__title">${title}</div>
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
              <dt>Размер/цвет</dt>
              <dd>${escapeHtml(o.size||'—')}${o.color?` · ${escapeHtml(o.color)}`:''}</dd>
            </div>
            <div class="kv__row">
              <dt>Сумма</dt>
              <dd>${price}</dd>
            </div>
            <div class="kv__row">
              <dt>Статус</dt>
              <dd>${escapeHtml(humanStatus(o.status))}</dd>
            </div>
            ${o.status==='отменён' ? `
              <div class="kv__row">
                <dt>Причина отмены</dt>
                <dd class="break">${escapeHtml(getCancelReason(o.id) || '—')}</dd>
              </div>` : ''}
            <div class="kv__row">
              <dt>Чек</dt>
              <dd>
                ${o.paymentScreenshot ? `
                  <div class="receipt-actions">
                    <button class="btn btn--sm btn--outline" data-preview="${escapeHtml(o.paymentScreenshot)}">
                      <i data-lucide="image"></i><span>&nbsp;Предпросмотр</span>
                    </button>
                    <a class="btn btn--sm btn--primary" href="${escapeHtml(o.paymentScreenshot)}" target="_blank" rel="noopener" download>
                      <i data-lucide="download"></i><span>&nbsp;Скачать</span>
                    </a>
                  </div>
                ` : '—'}
              </dd>
            </div>
          </dl>

          <div class="order-detail__actions">
            ${isNew ? `
              <button class="btn btn--primary" id="btnAccept" data-id="${o.id}">Принять</button>
              <button class="btn btn--outline" id="btnCancel" data-id="${o.id}">Отменить</button>
            ` : ''}

            ${(!isNew && !isDone) ? `
              <div class="stage-list" id="stageList" role="group" aria-label="Этапы заказа">
                ${ACTIVE_STAGES.map(s=>`
                  <button class="stage-btn ${o.status===s?'is-active':''}" data-st="${s}">${stageLabel(s)}</button>
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

    document.querySelector('[data-preview]')?.addEventListener('click', (e)=>{
      const url = e.currentTarget.getAttribute('data-preview');
      openReceiptPreview(url);
    });

    // Новый: принять
    document.getElementById('btnAccept')?.addEventListener('click', ()=>{
      acceptOrder(o.id);
      // событий здесь НЕ шлём: их отправляет core/orders.js
      render();
    });

    // Новый: отменить с комментарием
    document.getElementById('btnCancel')?.addEventListener('click', ()=>{
      const reason = prompt('Укажите причину отмены (видно будет только админам):');
      saveCancelReason(o.id, reason||'');
      cancelOrder(o.id, reason||'');
      // событий здесь НЕ шлём: их отправляет core/orders.js
      mode='list'; tab='done'; render();
    });

    // В процессе: выбор этапа (в т.ч. «выдан»)
    document.getElementById('stageList')?.addEventListener('click', (e)=>{
      const btn = e.target.closest('.stage-btn');
      if (!btn) return;
      const st = btn.getAttribute('data-st');
      if (!st) return;
      updateOrderStatus(o.id, st);
      // событий здесь НЕ шлём: их отправляет core/orders.js
      if (st === 'выдан'){ mode='list'; tab='done'; }
      render();
    });
  }

  function render(){
    if (mode==='detail') detailView();
    else listView();
  }

  function openReceiptPreview(url){
    if(!url) return;
    const modal = document.getElementById('modal');
    const mb = document.getElementById('modalBody');
    const mt = document.getElementById('modalTitle');
    const ma = document.getElementById('modalActions');
    if (!modal || !mb || !mt || !ma){
      window.open(url, '_blank', 'noopener');
      return;
    }
    mt.textContent = 'Чек оплаты';
    mb.innerHTML = `
      <div class="receipt-view">
        <div class="receipt-img-wrap">
          <img class="receipt-img" src="${escapeHtml(url)}" alt="Чек оплаты">
        </div>
        <div class="muted" style="font-size:12px">Если изображение не загрузилось — ссылка может быть приватной (требует доступ) или запрещена CORS.</div>
      </div>
    `;
    ma.innerHTML = `
      <a class="btn btn--outline" href="${escapeHtml(url)}" target="_blank" rel="noopener">Открыть в новой вкладке</a>
      <a class="btn btn--primary" href="${escapeHtml(url)}" download>Скачать</a>
    `;
    modal.classList.add('show');
    document.getElementById('modalClose').onclick = ()=> modal.classList.remove('show');
  }

  render();
}

function humanStatus(s){
  if (s==='новый') return 'Новый';
  if (s==='принят') return 'Принят';
  if (s==='собирается в китае') return 'Сборка';
  if (s==='вылетел в узб') return 'В пути';
  if (s==='на таможне') return 'Таможня';
  if (s==='на почте') return 'На почте';
  if (s==='забран с почты') return 'Забран';
  if (s==='выдан') return 'Выдан';
  if (s==='готов к отправке') return 'Готов к отправке';
  if (s==='отменён') return 'Отменён';
  return String(s||'');
}
function stageLabel(s){ return humanStatus(s); }

function escapeHtml(s=''){
  return String(s).replace(/[&<>"']/g, m=> ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}
