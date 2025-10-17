import { state, persistCart, updateCartBadge } from '../core/state.js';
import { t } from '../core/i18n.js';
import { priceFmt, colorToHex } from '../core/utils.js';
import { toast } from '../core/toast.js';
import { tg } from '../core/config.js';

export function addToCart(product, size, color){
  const same=(a)=> a.productId===product.id && a.size===size && a.color===color;
  const existing = state.cart.items.find(same);
  if (existing) existing.qty+=1; else state.cart.items.push({productId:product.id, size, color, qty:1});
  persistCart(); updateCartBadge(); if (state._onCartChange) state._onCartChange(); toast('Добавлено в корзину');
}
export function removeFromCart(productId, size, color){
  state.cart.items = state.cart.items.filter(a=>!(a.productId===productId && a.size===size && a.color===color));
  persistCart(); updateCartBadge(); if (state._onCartChange) state._onCartChange(); renderCart();
}
export function changeQty(productId, size, color, delta){
  const it = state.cart.items.find(a=>a.productId===productId && a.size===size && a.color===color);
  if (!it) return; it.qty += delta; if (it.qty<=0) removeFromCart(productId, size, color);
  persistCart(); updateCartBadge(); if (state._onCartChange) state._onCartChange(); renderCart();
}

export function renderCart(){
  closeDrawerIfNeeded();
  const summary = state.cart.items.map(it=>({...it, product: state.products.find(p=>String(p.id)===String(it.productId))})).filter(x=>x.product);
  const view=document.querySelector('#view');
  if (!summary.length){
    view.innerHTML = `<section class="section"><div class="h1">${t('cart')}</div><p class="sub">${t('empty')}</p><div class="cart-actions"><a href="#/" class="btn secondary">${t('back')}</a></div></section>`;
    return;
  }
  const total = summary.reduce((s,x)=> s + x.qty * x.product.price, 0);
  view.innerHTML = `
    <section class="section cart-head"><div class="h1">${t('cart')}</div></section>
    <section class="section cart" id="cartList">
      ${summary.map(x=>`
        <div class="cart-item" data-id="${x.product.id}" data-size="${x.size||''}" data-color="${x.color||''}">
          <img src="${x.product.images?.[0]||''}" alt="${x.product.title}">
          <div class="cart-mid"><div class="cart-title">${x.product.title}</div>
          <div class="cart-meta">${x.size ? `${t('size')}: ${x.size} • ` : ''}${x.color ? `${t('color')}: ${x.color} <span class="cm-swatch" style="background:${colorToHex(x.color)}"></span>` : ''}</div></div>
          <div class="cart-price">${priceFmt(x.product.price * x.qty)}</div>
          <div class="cart-right">
            <div class="qty"><button class="qty-dec" aria-label="-">–</button><span>${x.qty}</span><button class="qty-inc" aria-label="+">+</button></div>
            <button class="qty-del" aria-label="Удалить"><i data-lucide="trash-2"></i></button>
          </div>
        </div>`).join('')}
    </section>
    <section class="section cart-note">
      <div class="h2">${t('orderComment')}</div>
      <textarea id="orderNote" class="note-input" rows="3" placeholder="${t('orderCommentPlaceholder')}">${state.orderNote || ''}</textarea>
    </section>
    <section class="section cart-summary">
      <div class="row" style="justify-content:space-between;align-items:center">
        <div class="h2">${t('total')}</div><div class="price">${priceFmt(total)}</div>
      </div>
      <div class="cart-actions"><button id="clearCart" class="btn secondary">${t('clear')}</button><button id="proceedBtn" class="btn push-right">${t('proceed')}</button></div>
      <div class="footer-note sub" style="margin-top:8px">${t('support')}: <a class="link" href="https://t.me/evliseoutlet" target="_blank" rel="noopener">t.me/evliseoutlet</a></div>
    </section>`;

  document.querySelectorAll('.cart-item').forEach(row=>{
    const id=Number(row.getAttribute('data-id')); const size=row.getAttribute('data-size')||null; const color=row.getAttribute('data-color')||null;
    row.querySelector('.qty-inc').onclick=()=>changeQty(id,size,color,+1);
    row.querySelector('.qty-dec').onclick=()=>changeQty(id,size,color,-1);
    row.querySelector('.qty-del').onclick=()=>removeFromCart(id,size,color);
  });
  const noteEl=document.getElementById('orderNote'); noteEl.oninput=()=>{ state.orderNote = noteEl.value; localStorage.setItem('evlise_note', state.orderNote); };
  document.getElementById('proceedBtn').onclick=()=> checkoutInTelegram(summary);
  document.getElementById('clearCart').onclick=()=>{ state.cart.items=[]; persistCart(); updateCartBadge(); if (state._onCartChange) state._onCartChange(); toast(t('cleared')); renderCart(); };
  if (window.lucide?.createIcons) lucide.createIcons();
}

export function checkoutInTelegram(summary){
  const tgUser = tg?.initDataUnsafe?.user ? {
    id: tg.initDataUnsafe.user.id, username: tg.initDataUnsafe.user.username || null,
    first_name: tg.initDataUnsafe.user.first_name || null, last_name: tg.initDataUnsafe.user.last_name || null,
    language_code: tg.initDataUnsafe.user.language_code || null } : null;
  const order = {
    id: 'ORD-' + Math.random().toString(36).slice(2,8).toUpperCase(),
    cart: summary.map(x=>({id:x.product.id, title:x.product.title, price:x.product.price, qty:x.qty, size:x.size||null, color:x.color||null, image:x.product.images?.[0]||""})),
    total: summary.reduce((s,x)=> s + x.qty * x.product.price, 0),
    currency: 'UZS', comment: state.orderNote || "", user: tgUser, ts: Date.now(),
    status: 'Picked' // стартовый статус
  };

  // 1) Отправка в Telegram
  const payload = JSON.stringify(order);
  if (tg?.sendData){ tg.sendData(payload); toast('Заказ отправлен менеджеру в Telegram'); }
  else { navigator.clipboard.writeText(payload); toast('WebApp вне Telegram: заказ (JSON) скопирован'); }

  // 2) Локальное добавление в «реальный трекинг» (админы меняют статус вручную в JSON/админке)
  const key = `ev_orders_${tgUser?.id ?? 'demo'}`;
  const list = JSON.parse(localStorage.getItem(key) || '[]');
  list.unshift(order);
  localStorage.setItem(key, JSON.stringify(list));

  // 3) Очистка корзины и переход к заказам
  state.cart.items = []; persistCart(); updateCartBadge(); if (state._onCartChange) state._onCartChange();
  location.hash = '#/account/orders';
}

function closeDrawerIfNeeded(){ const d=document.querySelector('#drawer'); const o=document.querySelector('#overlay'); d.classList.remove('open'); o.classList.remove('show'); }
