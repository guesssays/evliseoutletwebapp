import { state, persistCart, updateCartBadge } from '../core/state.js';
import { priceFmt } from '../core/utils.js';
import { toast } from '../core/toast.js';
import { addOrder } from '../core/orders.js';
import { getPayRequisites } from '../core/payments.js';
import { persistProfile } from '../core/state.js';
import { getUID } from '../core/state.js';

const OP_CHAT_URL = 'https://t.me/evliseorder';

export function renderCart(){
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

  const total = items.reduce((s,x)=> s + x.qty * x.product.price, 0);
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
          <div class="cart-title" style="overflow-wrap:anywhere">${x.product.title}</div>
          <div class="cart-sub">${x.size?`Размер ${x.size}`:''} ${x.color?`• ${x.color}`:''}</div>
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

    <div class="payline">
      <div class="payrow"><span>Итого (${items.reduce((s,i)=>s+i.qty,0)} шт.)</span><b>${priceFmt(total)}</b></div>
      <div class="payrow"><span>Доставка</span><b>${priceFmt(0)}</b></div>
      <div class="payrow"><span>Скидка</span><b>${priceFmt(0)}</b></div>
    </div>

    <!-- FAQ перед оформлением (кнопка встроена в строку "Есть вопросы?") -->
    <div class="cart-faq" style="margin-top:14px">
      <style>
        .faq-card{border:1px solid var(--border,rgba(0,0,0,.12));border-radius:14px;padding:12px;background:var(--card,#f9f9f9);display:grid;gap:10px}
        .faq-row{display:grid;grid-template-columns:24px 1fr;gap:10px;align-items:start}
        .faq-q{font-weight:600}
        .faq-a{color:var(--muted,#6b7280)}
        /* строка вопроса с кнопкой справа */
        .faq-qline{display:flex;align-items:center;gap:10px;justify-content:space-between}
        .faq-qline .right-slot{margin-left:12px;display:flex;align-items:center}
        /* компактная пилюля */
        .pill.small{padding:6px 10px;font-size:.92rem;border-radius:999px;display:inline-flex;gap:8px;align-items:center}
        .pill.small i{width:16px;height:16px}
        /* на очень узких экранах переносим кнопку на следующую строку, но всё равно вправо */
        @media (max-width: 360px){
          .faq-qline{flex-wrap:wrap;row-gap:6px}
          .faq-qline .right-slot{width:100%;justify-content:flex-end}
        }
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
            <div class="faq-qline">
              <span class="faq-q">Есть вопросы?</span>
              <span class="right-slot">
                <button id="faqOperator" class="pill outline small" type="button" aria-label="Написать оператору в Telegram">
                  <i data-lucide="send"></i><span>Написать оператору</span>
                </button>
              </span>
            </div>
            <div class="faq-a">Ответим по размеру, оплате и статусу — просто напишите нам.</div>
          </div>
        </div>

        <div class="faq-row">
          <i data-lucide="credit-card"></i>
          <div>
            <div class="faq-q">Как проходит оплата?</div>
            <div class="faq-a">После подтверждения вы переводите на карту и загружаете скриншот оплаты. Мы быстро проверим и запустим заказ.</div>
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

  // CTA «Оформить заказ» в таббаре
  window.setTabbarCTA?.({
    html: `<i data-lucide="credit-card"></i><span>Оформить заказ</span>`,
    onClick(){ checkoutFlow(items, ad, total); }
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
function checkoutFlow(items, addr, total){
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
    openPayModal({ items, address, phone, payer, total });
  };

  function close(){ modal.classList.remove('show'); }
}

function openPayModal({ items, address, phone, payer, total }){
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
    </style>
    <div class="form-grid">
      <div class="cart-title" style="font-size:18px">К оплате: ${priceFmt(total)}</div>
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
      total,
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
