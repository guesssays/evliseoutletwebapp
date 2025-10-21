// src/components/Cart.js
import { state, persistCart, updateCartBadge } from '../core/state.js';
import { priceFmt } from '../core/utils.js';
import { toast } from '../core/toast.js';
import { addOrder } from '../core/orders.js';
import { getPayRequisites } from '../core/payments.js';
import { persistProfile } from '../core/state.js';
import { getUID } from '../core/state.js';

/* ===================== КЭШБЕК / РЕФЕРАЛЫ: правила ===================== */
const CASHBACK_RATE_BASE  = 0.05;   // 5%
const CASHBACK_RATE_BOOST = 0.10;   // 10% (1-й заказ реферала)
const REFERRER_RATE       = 0.05;   // 5% на каждый заказ реферала
const MAX_DISCOUNT_SHARE  = 0.30;   // максимум 30% от стоимости корзины
const MIN_REDEEM_POINTS   = 30000;  // минимум к списанию
const MAX_REDEEM_POINTS   = 150000; // максимум к списанию
const POINTS_MATURITY_MS  = 24 * 60 * 60 * 1000; // 24ч

/* ===================== Персональное локальное хранилище ===================== */
function k(base){ try{ const uid = getUID?.() || 'guest'; return `${base}__${uid}`; }catch{ return `${base}__guest`; } }

/** Структура баланса: { available, pending:[{id, pts, tsUnlock, reason, orderId?}], history:[...] } */
function readWallet(){
  try{
    const w = JSON.parse(localStorage.getItem(k('points_wallet')) || '{}');
    return {
      available: Math.max(0, Number(w.available||0)|0),
      pending: Array.isArray(w.pending) ? w.pending : [],
      history: Array.isArray(w.history) ? w.history : [],
    };
  }catch{ return { available:0, pending:[], history:[] }; }
}
function writeWallet(w){
  localStorage.setItem(k('points_wallet'), JSON.stringify(w||{available:0,pending:[],history:[]}));
}
function settleMatured(){
  const w = readWallet();
  const now = Date.now();
  let changed=false;
  const keep=[]; 
  for (const p of w.pending){
    if ((p.tsUnlock||0) <= now){
      w.available += Math.max(0, Number(p.pts)||0);
      w.history.unshift({ ts: now, type:'accrue', pts: p.pts|0, reason: p.reason||'Кэшбек', orderId: p.orderId||null });
      changed=true;
    }else keep.push(p);
  }
  if (changed){
    w.pending = keep;
    writeWallet(w);
  }
  return w;
}

function addPending(pts, reason, orderId){
  const w = readWallet();
  const id = `p_${Date.now()}`;
  w.pending.push({ id, pts: Math.max(0, pts|0), reason: String(reason||''), orderId: orderId||null, tsUnlock: Date.now()+POINTS_MATURITY_MS });
  writeWallet(w);
}
function spendPoints(pts, orderId){
  const w = readWallet();
  const p = Math.max(0, pts|0);
  if (w.available < p) return false;
  w.available -= p;
  w.history.unshift({ ts: Date.now(), type:'spend', pts: -p, reason:'Списано при оплате', orderId: orderId||null });
  writeWallet(w);
  return true;
}

/* ====== Реферал-профиль пользователя ====== */
function readRefProfile(){
  try{ return JSON.parse(localStorage.getItem(k('ref_profile')) || '{}'); }catch{ return {}; }
}
function writeRefProfile(obj){
  localStorage.setItem(k('ref_profile'), JSON.stringify(obj||{}));
}
function hasFirstOrderBoost(){
  const rp = readRefProfile();
  return !!rp.firstOrderBoost && !rp.firstOrderDone;
}
function markFirstOrderDone(){
  const rp = readRefProfile();
  rp.firstOrderDone = true;
  writeRefProfile(rp);
}

/* ====== Начисление рефереру (инвайтеру) ====== */
function addReferrerPendingIfAny(paidAmount, orderId){
  try{
    const me = getUID?.() || '';
    const rp = readRefProfile();
    const inviter = String(rp.inviter||'').trim();
    if (!inviter || inviter === String(me)) return;

    // ограничения по антифроду: не начислять, если инвайтер превысил лимит уникальных рефералов/мес
    // учёт ведётся в отдельном ключе на стороне инвайтера
    const monthKey = new Date().toISOString().slice(0,7); // YYYY-MM
    const INV_KEY = `ref_control__${inviter}`;
    let inv = {};
    try{ inv = JSON.parse(localStorage.getItem(INV_KEY) || '{}'); }catch{ inv={}; }
    const setKey = `set_${monthKey}`;
    const whoSet = new Set(Array.isArray(inv[setKey]) ? inv[setKey] : []);
    if (!whoSet.has(me) && whoSet.size >= 10){
      // лимит новых рефералов/мес достигнут → показываем только базовый сценарий без награды инвайтеру
      return;
    }
    // фиксируем «этот реферал учтён»
    if (!whoSet.has(me)){ whoSet.add(me); inv[setKey] = [...whoSet]; localStorage.setItem(INV_KEY, JSON.stringify(inv)); }

    // собственно начисление
    const pts = Math.floor(Number(paidAmount||0) * REFERRER_RATE);
    if (pts > 0){
      // кошелёк инвайтера хранится под его UID → пишем напрямую
      const mk = (base)=> `${base}__${inviter}`;
      let w={available:0,pending:[],history:[]};
      try{ w = JSON.parse(localStorage.getItem(mk('points_wallet')) || '{}'); }catch{}
      if (!Array.isArray(w.pending)) w.pending=[];
      if (!Array.isArray(w.history)) w.history=[];
      w.pending.push({ id:`r_${Date.now()}`, pts, reason:`Реферал #${getUID?.()||'-'}`, orderId, tsUnlock: Date.now()+POINTS_MATURITY_MS });
      localStorage.setItem(mk('points_wallet'), JSON.stringify(w));
    }
  }catch{}
}

const OP_CHAT_URL = 'https://t.me/evliseorder';

export function renderCart(){
  // при каждом входе в корзину пытаемся «дозреть» отложенные баллы
  const wallet = settleMatured();

  const v = document.getElementById('view');
  const items = state.cart.items
    .map(it => ({ ...it, product: state.products.find(p => String(p.id) === String(it.productId)) }))
    .filter(x => x.product);

  // актуализируем таббар
  window.setTabbarMenu?.('cart');

  // пустая корзина
  if (!items.length){
    v.innerHTML = `
      <div class="section-title" style="display:flex;align-items:center;gap:10px">
        <button class="square-btn" id="cartBack" aria-label="Назад"><i data-lucide="chevron-left"></i></button>
        Корзина
      </div>
      <section class="checkout"><div class="cart-sub">Корзина пуста</div></section>`;
    window.lucide?.createIcons && lucide.createIcons();
    document.getElementById('cartBack')?.addEventListener('click', ()=>history.back());
    // гарантированно в начало
    resetScrollTop();
    return;
  }

  const totalRaw = items.reduce((s,x)=> s + x.qty * x.product.price, 0);

  // подготовим UI списания
  const canRedeemMaxByShare = Math.floor(totalRaw * MAX_DISCOUNT_SHARE);
  const redeemMax = Math.max(0, Math.min(canRedeemMaxByShare, wallet.available, MAX_REDEEM_POINTS));
  const redeemMin = MIN_REDEEM_POINTS;

  // восстановим черновик ввода (если пользователь экспериментировал)
  const draft = Number(sessionStorage.getItem(k('redeem_draft'))||0) | 0;
  const redeemInit = Math.max(0, Math.min(redeemMax, draft));

  const ad = state.addresses.list.find(a=>a.id===state.addresses.defaultId) || null;

  v.innerHTML = `
  <div class="section-title" style="display:flex;align-items:center;gap:10px">
    <button class="square-btn" id="cartBack" aria-label="Назад"><i data-lucide="chevron-left"></i></button>
    Оформление
  </div>

  <section class="checkout" id="cList">
    ${items.map(x=>`
      <div class="cart-row" data-id="${String(x.product.id)}" data-size="${x.size||''}" data-color="${x.color||''}">
        <div class="cart-img"><img src="${x.product.images?.[0]||''}" alt=""></div>
        <div>
          <div class="cart-title" style="overflow-wrap:anywhere">${escapeHtml(x.product.title)}</div>
          <div class="cart-sub">${x.size?`Размер ${escapeHtml(x.size)}`:''} ${x.color?`• ${escapeHtml(x.color)}`:''}</div>
          <div class="cart-price">${priceFmt(x.product.price)}</div>
        </div>
        <div class="qty-mini">
          <button class="ctrl dec" aria-label="Минус"><i data-lucide="minus"></i></button>
          <span>${x.qty}</span>
          <button class="ctrl inc" aria-label="Плюс"><i data-lucide="plus"></i></button>
        </div>
      </div>`).join('')}

    <div class="shipping">
      <div class="address-row">
        <div class="address-left">
          <div class="cart-title">Адрес доставки</div>
          ${ad ? `<div class="cart-sub">${escapeHtml(ad.nickname)} — ${escapeHtml(ad.address)}</div>` :
            `<div class="cart-sub">Адрес не указан</div>`}
        </div>
        <a class="pill" href="#/account/addresses">${ad ? 'Изменить адрес' : 'Добавить адрес'}</a>
      </div>
    </div>

    <!-- Блок списания баллов -->
    <div class="cashback-box" style="margin-top:10px;border:1px solid var(--border,rgba(0,0,0,.12));border-radius:12px;padding:10px;background:var(--card,rgba(0,0,0,.03))">
      <div class="cart-title" style="display:flex;align-items:center;gap:8px">
        <i data-lucide="coins"></i>
        <span>Списать баллы</span>
        <span class="muted" style="margin-left:auto">Доступно: <b id="cbAvail">${wallet.available|0}</b></span>
      </div>
      <div class="muted mini" style="margin:6px 0 8px">
        Минимум к списанию: ${MIN_REDEEM_POINTS.toLocaleString('ru-RU')} · максимум: ${Math.max(0, redeemMax).toLocaleString('ru-RU')} (не больше 30% от суммы и не более 150&nbsp;000)
      </div>
      <div style="display:grid;grid-template-columns:1fr auto;gap:8px;align-items:center">
        <input id="redeemInput" class="input" inputmode="numeric" pattern="[0-9]*" value="${redeemInit||''}" placeholder="0">
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          <button class="pill" id="redeemMaxBtn">Макс</button>
          <button class="pill" id="redeemClearBtn">Сброс</button>
        </div>
      </div>
      <div id="redeemHint" class="muted mini" style="margin-top:6px"></div>
    </div>

    <div class="payline">
      <div class="payrow"><span>Товары (${items.reduce((s,i)=>s+i.qty,0)} шт.)</span><b id="sumRaw">${priceFmt(totalRaw)}</b></div>
      <div class="payrow"><span>Доставка</span><b>${priceFmt(0)}</b></div>
      <div class="payrow"><span>Скидка баллами</span><b id="sumDisc">${priceFmt(0)}</b></div>
      <div class="payrow" style="border-top:1px dashed var(--border,rgba(0,0,0,.12));padding-top:6px"><span><b>К оплате</b></span><b id="sumPay">${priceFmt(totalRaw)}</b></div>
    </div>

        <!-- FAQ перед оформлением -->
    <div class="cart-faq" style="margin-top:14px">
      <style>
        .faq-card{border:1px solid var(--border,rgba(0,0,0,.12));border-radius:14px;padding:12px;background:var(--card,#f9f9f9);display:grid;gap:12px;max-width:100%}
        .faq-row{display:grid;grid-template-columns:24px 1fr;column-gap:10px;align-items:start}
        .faq-q{font-weight:600}
        .faq-a{color:var(--muted,#6b7280);margin-top:4px;line-height:1.35}
        .faq-actions{margin-top:8px}
        .faq-actions .pill{display:inline-flex;align-items:center;gap:8px}
        .faq-actions .pill i{width:16px;height:16px}
      </style>

      <div class="faq-card" role="region" aria-label="Частые вопросы перед оформлением">
        <div class="faq-row">
          <i data-lucide="clock"></i>
          <div>
            <div class="faq-q">Сроки доставки</div>
            <div class="faq-a">Обычно <b>14–16 дней</b> с момента подтверждения. Если срок изменится — мы уведомим.</div>
          </div>
        </div>

        <div class="faq-row">
          <i data-lucide="message-circle"></i>
          <div>
            <div class="faq-q">Есть вопросы?</div>
            <div class="faq-a">Ответим по размеру, оплате и статусу — просто напишите нам.</div>
            <div class="faq-actions">
              <button id="faqOperator" class="pill outline" type="button" aria-label="Написать оператору в Telegram">
                <i data-lucide="send"></i><span>Написать оператору</span>
              </button>
            </div>
          </div>
        </div>

        <div class="faq-row">
          <i data-lucide="credit-card"></i>
          <div>
            <div class="faq-q">Как проходит оплата?</div>
            <div class="faq-a">После подтверждения вы переводите сумму на карту и загружаете скриншот оплаты. Если платёж действителен — мы подтверждаем заказ.</div>
          </div>
        </div>
      </div>
    </div>
    <!-- /FAQ -->


  </section>`;

  window.lucide?.createIcons && lucide.createIcons();

  // гарантированно фиксируем скролл на начало после рендера
  resetScrollTop();

  document.getElementById('cartBack')?.addEventListener('click', ()=>history.back());

  document.querySelectorAll('.cart-row').forEach(row=>{
    const id   = row.getAttribute('data-id');
    const size = row.getAttribute('data-size') || null;
    const color= row.getAttribute('data-color') || null;

    row.querySelector('.inc')?.addEventListener('click', ()=> changeQty(id,size,color, +1));
    row.querySelector('.dec')?.addEventListener('click', ()=> changeQty(id,size,color, -1));
  });

  // Кнопка «Написать оператору»
  document.getElementById('faqOperator')?.addEventListener('click', ()=> openExternal(OP_CHAT_URL));

  // Управление списанием
  const inEl    = document.getElementById('redeemInput');
  const hintEl  = document.getElementById('redeemHint');
  const discEl  = document.getElementById('sumDisc');
  const payEl   = document.getElementById('sumPay');

  function clampRedeem(x){
    let v = Math.max(0, Number(x)||0);
    v = Math.min(v, redeemMax);
    return v|0;
  }

  function validateRedeem(v){
    if (v===0) return '';
    if (v < redeemMin) return `Минимум для списания: ${MIN_REDEEM_POINTS.toLocaleString('ru-RU')} баллов`;
    if (v > wallet.available) return 'Недостаточно баллов';
    if (v > redeemMax) return 'Превышает лимит (30% от суммы, максимум 150 000)';
    return '';
  }

  function recalc(){
    const v = clampRedeem(inEl.value);
    sessionStorage.setItem(k('redeem_draft'), String(v));
    const err = validateRedeem(v);
    hintEl.textContent = err;
    hintEl.style.color = err ? '#b91c1c' : 'var(--muted,#666)';
    const disc = (err || v===0) ? 0 : v;
    const pay  = Math.max(0, totalRaw - disc);
    discEl.textContent = priceFmt(disc);
    payEl.textContent  = priceFmt(pay);
    return { disc, pay, err };
  }

  inEl?.addEventListener('input', recalc);
  document.getElementById('redeemMaxBtn')?.addEventListener('click', ()=>{ inEl.value = String(redeemMax); recalc(); });
  document.getElementById('redeemClearBtn')?.addEventListener('click', ()=>{ inEl.value=''; recalc(); });
  recalc();

  // CTA «Оформить заказ» в таббаре
  window.setTabbarCTA?.({
    html: `<i data-lucide="credit-card"></i><span>Оформить заказ</span>`,
    onClick(){
      const { disc, pay, err } = recalc();
      if (err){ toast(err); return; }
      checkoutFlow(items, ad, totalRaw, { redeem: disc, toPay: pay });
    }
  });
}

/* ---------- scroll control: гарантированно в начало ---------- */
function resetScrollTop(){
  try{ document.activeElement?.blur?.(); }catch{}
  requestAnimationFrame(()=> {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    requestAnimationFrame(()=> window.scrollTo({ top: 0, left: 0, behavior: 'auto' }));
  });
}

/* ---------- изменение количества / удаление ---------- */
function changeQty(productId,size,color,delta){
  const it = state.cart.items.find(a =>
    String(a.productId)===String(productId) &&
    (a.size||null)===(size||null) &&
    (a.color||null)===(color||null)
  );
  if (!it) return;
  it.qty += delta;
  if (it.qty <= 0) return remove(productId,size,color);
  persistCart(); updateCartBadge(); renderCart();
}

function remove(productId,size,color){
  state.cart.items = state.cart.items.filter(a => !(
    String(a.productId)===String(productId) &&
    (a.size||null)===(size||null) &&
    (a.color||null)===(color||null)
  ));
  persistCart(); updateCartBadge(); toast('Удалено'); renderCart();
}

/* ======================
   Новый сценарий чекаута
   ====================== */
function checkoutFlow(items, addr, totalRaw, bill){
  if (!items?.length){ toast('Корзина пуста'); return; }
  if (!addr){ toast('Укажите адрес доставки'); location.hash='#/account/addresses'; return; }

  // 1) Модалка подтверждения данных
  const modal = document.getElementById('modal');
  const mb = document.getElementById('modalBody');
  const mt = document.getElementById('modalTitle');
  const ma = document.getElementById('modalActions');

  const savedPhone = state.profile?.phone || '';
  const savedPayer = state.profile?.payerFullName || '';

  mt.textContent = 'Подтверждение данных';

  const list = state.addresses.list.slice();
  const def = state.addresses.defaultId;
  const defItem = list.find(a=>a.id===def) || addr;

  mb.innerHTML = `
    <style>
      .addr-picker{ margin-top:6px; border:1px solid var(--border, rgba(0,0,0,.12)); border-radius:10px; padding:6px; background:var(--card,#f6f6f6); }
      .addr-p-row{ display:flex; align-items:flex-start; gap:10px; padding:8px; border-radius:8px; cursor:pointer; }
      .addr-p-row:hover{ background: rgba(0,0,0,.05); }
      .addr-p-title{ font-weight:700; }
      .addr-p-sub{ color:var(--muted,#666); font-size:.92rem; line-height:1.25; }
      .link-like{ color:var(--link,#0a84ff); cursor:pointer; text-decoration:underline; }
    </style>
    <div class="form-grid">
      <label class="field"><span>Номер телефона</span>
        <input id="cfPhone" class="input" placeholder="+998 ..." value="${escapeHtml(savedPhone)}">
      </label>
      <label class="field"><span>ФИО плательщика</span>
        <input id="cfPayer" class="input" placeholder="Фамилия Имя" value="${escapeHtml(savedPayer)}">
      </label>
      <label class="field"><span>Адрес доставки</span>
        <input id="cfAddr" class="input" value="${escapeHtml(addr.address)}">
        <div class="helper">Сохранённый адрес: <b id="cfSavedName">${escapeHtml(defItem?.nickname||'')}</b> — <span id="cfChangeSaved" class="link-like">изменить</span></div>
        <div id="addrPicker" class="addr-picker" style="display:none">
          ${list.length ? list.map(a=>`
            <div class="addr-p-row" data-id="${a.id}">
              <i data-lucide="map-pin" style="min-width:18px"></i>
              <div>
                <div class="addr-p-title">${escapeHtml(a.nickname||'Без названия')}</div>
                <div class="addr-p-sub">${escapeHtml(a.address||'')}</div>
              </div>
            </div>
          `).join('') : `<div class="addr-p-sub">Сохранённых адресов нет. Добавьте в профиле.</div>`}
        </div>
      </label>
      <div class="field">
        <span>Товары в заказе</span>
        <ul style="margin:6px 0 0; padding-left:18px; color:#444">
          ${items.map(x=>`<li>${escapeHtml(x.product.title)} · ${x.size?`размер ${escapeHtml(x.size)} `:''}${x.color?`· ${escapeHtml(x.color)} `:''}×${x.qty}</li>`).join('')}
        </ul>
      </div>
      <label class="field" style="display:flex;align-items:center;gap:10px">
        <input id="cfSavePhone" type="checkbox" ${savedPhone?'checked':''}>
        <span>Запомнить телефон</span>
      </label>
      <label class="field" style="display:flex;align-items:center;gap:10px">
        <input id="cfSavePayer" type="checkbox" ${savedPayer?'checked':''}>
        <span>Запомнить ФИО плательщика</span>
      </label>
    </div>
  `;
  ma.innerHTML = `
    <button id="cfCancel" class="pill">Отмена</button>
    <button id="cfNext" class="pill primary">Далее к оплате</button>
  `;
  modal.classList.add('show');
  window.lucide?.createIcons && lucide.createIcons();

  // === выбор сохранённого адреса ===
  const changeLink = document.getElementById('cfChangeSaved');
  const picker = document.getElementById('addrPicker');
  const addrInput = document.getElementById('cfAddr');
  const savedName = document.getElementById('cfSavedName');

  if (changeLink){
    changeLink.addEventListener('click', (e)=>{
      e.preventDefault();
      if (!picker) return;
      const show = picker.style.display === 'none';
      picker.style.display = show ? '' : 'none';
    });
  }
  if (picker){
    picker.addEventListener('click', (e)=>{
      const row = e.target.closest('.addr-p-row'); if (!row) return;
      const id = Number(row.getAttribute('data-id'));
      const sel = state.addresses.list.find(x=>Number(x.id)===id);
      if (!sel) return;
      addrInput.value = sel.address || '';
      if (savedName) savedName.textContent = sel.nickname || 'Без названия';
      picker.style.display = 'none';
    });
  }

  document.getElementById('modalClose').onclick = close;
  document.getElementById('cfCancel').onclick = close;
  document.getElementById('cfNext').onclick = ()=>{
    const phone = (document.getElementById('cfPhone')?.value||'').trim();
    const payer = (document.getElementById('cfPayer')?.value||'').trim();
    const address= (document.getElementById('cfAddr')?.value||'').trim();
    const savePhone = document.getElementById('cfSavePhone')?.checked;
    const savePayer = document.getElementById('cfSavePayer')?.checked;

    if (!phone){ toast('Укажите номер телефона'); return; }
    if (!address){ toast('Укажите адрес'); return; }

    if (!state.profile) state.profile = {};
    if (savePhone){ state.profile.phone = phone; }
    if (savePayer){ state.profile.payerFullName = payer; }
    persistProfile();

    close();
    openPayModal({ items, address, phone, payer, totalRaw, bill });
  };

  function close(){ modal.classList.remove('show'); }
}

/* ======== Оплата + фиксация заказа, баллов, рефералов ======== */
function openPayModal({ items, address, phone, payer, totalRaw, bill }){
  const redeem = Number(bill?.redeem||0)|0;
  const toPay  = Math.max(0, Number(bill?.toPay||0));

  const modal = document.getElementById('modal');
  const mb = document.getElementById('modalBody');
  const mt = document.getElementById('modalTitle');
  const ma = document.getElementById('modalActions');

  const pay = getPayRequisites();

  // переменные для файла чека (предпросмотр/сжатие)
  let shotDataUrl = '';   // data:image/jpeg;base64,...
  let shotBusy = false;

  mt.textContent = 'Оплата заказа';
  mb.innerHTML = `
    <style>
      .note{ display:grid; grid-template-columns: 24px 1fr; gap:10px; align-items:center; }
      .shot-wrap{ display:grid; gap:8px; }
      .shot-preview{ display:flex; align-items:center; gap:10px; }
      .shot-preview img{ width:64px; height:64px; object-fit:cover; border-radius:8px; border:1px solid var(--border, rgba(0,0,0,.1)); }
      .pay-badge{ display:inline-block; font-size:.8rem; line-height:1.2; padding:2px 6px; border-radius:999px; background:rgba(0,0,0,.06); vertical-align:middle; }
      .note-sub.muted{ color:var(--muted,#6b7280); }
      .spin{ width:16px; height:16px; border:2px solid rgba(0,0,0,.2); border-top-color:rgba(0,0,0,.6); border-radius:50%; animation:spin .8s linear infinite; }
      @keyframes spin{to{transform:rotate(360deg)}}
      .muted-mini{ color:var(--muted,#6b7280); font-size:.88rem; }
    </style>
    <div class="form-grid">
      <div class="cart-title" style="font-size:18px">К оплате: ${priceFmt(toPay)} ${redeem>0 ? `<span class="muted-mini">(${priceFmt(totalRaw)} − ${priceFmt(redeem)} баллов)</span>`:''}</div>
      <div class="note">
        <i data-lucide="credit-card"></i>
        <div>
          <div class="note-title">Переведите на карту</div>
          <div class="note-sub" style="user-select:all">${escapeHtml(pay.cardNumber)}</div>
          <div class="note-sub muted">
            ${escapeHtml(pay.holder || '')}
            ${pay.provider ? ` · <span class="pay-badge">${escapeHtml(pay.provider)}</span>` : ''}
          </div>
        </div>
      </div>
      <div class="field shot-wrap">
        <label><span>Загрузить скриншот оплаты</span></label>
        <input id="payShot" type="file" accept="image/*" class="input">
        <div class="helper">или вставьте URL изображения чека</div>
        <input id="payShotUrl" class="input" placeholder="https://...">
        <div id="shotPreview" class="shot-preview" style="display:none">
          <div id="shotThumbWrap"></div>
          <div id="shotMeta" class="muted"></div>
          <button id="shotClear" class="pill" style="margin-left:auto">Сбросить</button>
        </div>
        <div id="shotBusy" style="display:none;display:flex;align-items:center;gap:8px">
          <div class="spin" aria-hidden="true"></div>
          <span class="muted">Обрабатываем изображение…</span>
        </div>
      </div>
    </div>
  `;
  ma.innerHTML = `
    <button id="payBack" class="pill">Назад</button>
    <button id="payDone" class="pill primary">Подтвердить оплату</button>
  `;
  modal.classList.add('show');
  window.lucide?.createIcons && lucide.createIcons();

  // обработка файла: сжатие -> dataURL + предпросмотр
  const fileInput   = document.getElementById('payShot');
  const urlInput    = document.getElementById('payShotUrl');
  const pv          = document.getElementById('shotPreview');
  const thumbWrap   = document.getElementById('shotThumbWrap');
  const meta        = document.getElementById('shotMeta');
  const clearBtn    = document.getElementById('shotClear');
  const busyBar     = document.getElementById('shotBusy');

  fileInput?.addEventListener('change', async ()=>{
    const file = fileInput.files?.[0];
    if (!file){ clearShot(); return; }
    if (!/^image\//i.test(file.type)){ toast('Загрузите изображение'); clearShot(); return; }

    try{
      shotBusy = true; busyBar.style.display='flex';
      const { dataUrl, outW, outH } = await compressImageToDataURL(file, 1600, 1600, 0.82);
      shotDataUrl = dataUrl;
      pv.style.display = '';
      thumbWrap.innerHTML = `<img alt="Чек" src="${shotDataUrl}">`;
      const kb = Math.round((dataUrl.length * 3 / 4) / 1024);
      meta.textContent = `Предпросмотр ${outW}×${outH} · ~${kb} KB`;
      urlInput.value = '';
    }catch(err){
      console.error(err);
      toast('Не удалось обработать изображение');
      clearShot();
    }finally{
      shotBusy = false; busyBar.style.display='none';
    }
  });

  clearBtn?.addEventListener('click', ()=>{
    clearShot();
    fileInput.value = '';
  });

  function clearShot(){
    shotDataUrl = '';
    pv.style.display='none';
    thumbWrap.innerHTML = '';
    meta.textContent = '';
  }

  document.getElementById('modalClose').onclick = close;
  document.getElementById('payBack').onclick = close;
  document.getElementById('payDone').onclick = async ()=>{
    if (shotBusy){ toast('Подождите, изображение ещё обрабатывается'); return; }

    const urlRaw = (urlInput?.value || '').trim();
    let paymentScreenshot = '';

    if (shotDataUrl){
      paymentScreenshot = shotDataUrl;
    }else if (urlRaw){
      if (!/^https?:\/\//i.test(urlRaw)){ toast('Некорректный URL чека'); return; }
      paymentScreenshot = urlRaw;
    }else{
      toast('Добавьте файл чека или укажите URL');
      return;
    }

    // если пользователь списывал баллы — списываем прямо сейчас (до создания заказа), чтобы в случае перезагрузки не было двойного использования
    const toSpend = Number(bill?.redeem||0)|0;
    if (toSpend>0){
      if (!spendPoints(toSpend, null)){
        toast('Не удалось списать баллы — обновите страницу'); return;
      }
    }

    const first = items[0];
    const orderId = await addOrder({
      cart: items.map(x=>({
        id: x.product.id,
        title: x.product.title,
        price: x.product.price,
        qty: x.qty,
        size: x.size || null,
        color: x.color || null,
        images: x.product.images || []
      })),
      productId: first?.product?.id || null,
      size: first?.size || null,
      color: first?.color || null,
      link: first?.product?.id ? `#/product/${first.product.id}` : '',
      total: toPay,                  // к оплате с учётом списания
      currency: 'UZS',
      address,
      phone,
      username: state.user?.username || '',
      userId: getUID(),
      payerFullName: payer || '',
      paymentScreenshot,
      status: 'новый',
      accepted: false
    });

    // Начисления кэшбека → в pending (24ч)
    const boost = hasFirstOrderBoost();
    const rate  = boost ? CASHBACK_RATE_BOOST : CASHBACK_RATE_BASE;
    const earn  = Math.floor(toPay * rate);
    if (earn > 0){
      addPending(earn, boost ? 'Кэшбек x2 (первый заказ по реф-ссылке)' : 'Кэшбек', orderId);
    }

    // Рефереру 5% → тоже в pending (24ч)
    addReferrerPendingIfAny(toPay, orderId);

    // Отметить, что первый заказ (для буста) совершен
    if (boost) markFirstOrderDone();

    state.cart.items = [];
    persistCart(); updateCartBadge();

    close();
    showOrderConfirmationModal(orderId);

    try{
      const ev = new CustomEvent('client:orderPlaced', { detail:{ id: orderId } });
      window.dispatchEvent(ev);
    }catch{}
  };

  function close(){ modal.classList.remove('show'); }
}

/** Модалка «Заказ принят» */
function showOrderConfirmationModal(orderId){
  const modal = document.getElementById('modal');
  const mb = document.getElementById('modalBody');
  const mt = document.getElementById('modalTitle');
  const ma = document.getElementById('modalActions');

  mt.textContent = 'Заказ принят';

  mb.innerHTML = `
    <style>
      .ok-hero{
        display:flex; align-items:center; gap:12px; padding:12px;
        border:1px solid var(--border, rgba(0,0,0,.12)); border-radius:14px;
        background:var(--card, #f8f8f8);
      }
      .ok-hero i{ width:28px; height:28px; }
      .ok-steps{ display:grid; gap:10px; margin-top:12px; }
      .ok-step{ display:grid; grid-template-columns: 28px 1fr; gap:10px; align-items:start; }
      .muted{ color:var(--muted,#6b7280); }
    </style>
    <div class="ok-hero">
      <i data-lucide="shield-check"></i>
      <div>
        <div class="cart-title">#${orderId}</div>
        <div class="muted">Заказ успешно принят, скоро его возьмут в работу.</div>
      </div>
    </div>

    <div class="ok-steps">
      <div class="ok-step">
        <i data-lucide="clock"></i>
        <div>
          <div class="cart-title" style="font-size:15px">Сроки доставки</div>
          <div class="muted">Ориентировочно <b>14–16 дней</b>. Если срок изменится — мы уведомим.</div>
        </div>
      </div>
      <div class="ok-step">
        <i data-lucide="message-circle"></i>
        <div>
          <div class="cart-title" style="font-size:15px">Вопросы по заказу</div>
          <div class="muted">Если появились вопросы — напишите оператору. Мы отвечаем как можно быстрее.</div>
        </div>
      </div>
      <div class="ok-step">
        <i data-lucide="package"></i>
        <div>
          <div class="cart-title" style="font-size:15px">Когда свяжемся</div>
          <div class="muted">Как только заказ будет готов к отправке, оператор свяжется для уточнения деталей.</div>
        </div>
      </div>
    </div>
  `;

  ma.innerHTML = `
    <button id="okOperator" class="pill">Написать оператору</button>
    <button id="okOrders" class="pill primary">К моим заказам</button>
  `;

  modal.classList.add('show');
  window.lucide?.createIcons && lucide.createIcons();

  document.getElementById('modalClose').onclick = close;
  document.getElementById('okOrders').onclick = ()=>{
    close();
    location.hash = '#/orders';
  };
  document.getElementById('okOperator').onclick = ()=>{
    openExternal(OP_CHAT_URL);
  };

  function close(){ modal.classList.remove('show'); }
}

/* ===== helpers ===== */
function openExternal(url){
  try{
    const tg = window?.Telegram?.WebApp;
    if (tg?.openTelegramLink){
      tg.openTelegramLink(url);
      return;
    }
    if (tg?.openLink){
      tg.openLink(url, { try_instant_view:false });
      return;
    }
  }catch{}
  window.open(url, '_blank', 'noopener');
}

/* ===== utils: компрессор изображений в dataURL ===== */
function compressImageToDataURL(file, maxW=1600, maxH=1600, quality=0.82){
  return new Promise((resolve, reject)=>{
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = ()=>{
      try{
        let { width:w, height:h } = img;
        const ratio = Math.min(1, maxW / w, maxH / h);
        const outW = Math.max(1, Math.round(w * ratio));
        const outH = Math.max(1, Math.round(h * ratio));
        const canvas = document.createElement('canvas');
        canvas.width = outW; canvas.height = outH;
        const ctx = canvas.getContext('2d', { alpha:false });
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, outW, outH);
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        URL.revokeObjectURL(url);
        resolve({ dataUrl, outW, outH });
      }catch(e){
        URL.revokeObjectURL(url);
        reject(e);
      }
    };
    img.onerror = (e)=>{ URL.revokeObjectURL(url); reject(e); };
    img.src = url;
  });
}

function escapeHtml(s=''){
  return String(s).replace(/[&<>"']/g, m=> ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}
