import { state, persistCart, updateCartBadge } from '../core/state.js';
import { priceFmt } from '../core/utils.js';
import { toast } from '../core/toast.js';

export function renderCart(){
  const v=document.getElementById('view');
  const items = state.cart.items.map(it=>({...it, product: state.products.find(p=>String(p.id)===String(it.productId))})).filter(x=>x.product);
  if (!items.length){
    v.innerHTML = `<div class="section-title">Корзина</div><section class="checkout"><div class="cart-sub">Корзина пуста</div></section>`;
    return;
  }
  const total = items.reduce((s,x)=> s + x.qty * x.product.price, 0);
  v.innerHTML = `<div class="section-title">Оформление</div>
  <section class="checkout" id="cList">
    ${items.map(x=>`
      <div class="cart-row" data-id="${x.product.id}" data-size="${x.size||''}" data-color="${x.color||''}">
        <div class="cart-img"><img src="${x.product.images?.[0]||''}" alt=""></div>
        <div>
          <div class="cart-title">${x.product.title}</div>
          <div class="cart-sub">${x.size?`Размер ${x.size}`:''} ${x.color?`• ${x.color}`:''}</div>
          <div class="cart-price">${priceFmt(x.product.price)}</div>
        </div>
        <div class="qty-mini">
          <button class="ctrl dec"><i data-lucide="minus"></i></button>
          <span>${x.qty}</span>
          <button class="ctrl inc"><i data-lucide="plus"></i></button>
        </div>
      </div>`).join('')}
    <div class="shipping">
      <div class="cart-title">Данные для доставки</div>
      <div class="cart-sub">Определим в чате Telegram после оформления</div>
    </div>
    <div class="payline">
      <div class="payrow"><span>Итого (${items.reduce((s,i)=>s+i.qty,0)} шт.)</span><b>${priceFmt(total)}</b></div>
      <div class="payrow"><span>Доставка</span><b>$0.00</b></div>
      <div class="payrow"><span>Скидка</span><b>$0.00</b></div>
    </div>
  </section>
  <div class="paybtn"><button id="payBtn" class="btn">Оплатить в Telegram</button></div>`;
  window.lucide?.createIcons();

  // qty handlers
  document.querySelectorAll('.cart-row').forEach(row=>{
    const id=Number(row.getAttribute('data-id'));
    const size=row.getAttribute('data-size')||null; const color=row.getAttribute('data-color')||null;
    row.querySelector('.inc').onclick=()=> changeQty(id,size,color, +1);
    row.querySelector('.dec').onclick=()=> changeQty(id,size,color, -1);
  });
  document.getElementById('payBtn').onclick=()=> checkoutInTelegram(items);
}

function changeQty(productId,size,color,delta){
  const it = state.cart.items.find(a=>a.productId===productId && a.size===size && a.color===color);
  if (!it) return; it.qty += delta; if (it.qty<=0) remove(productId,size,color);
  persistCart(); updateCartBadge(); renderCart();
}
function remove(productId,size,color){
  state.cart.items = state.cart.items.filter(a=>!(a.productId===productId && a.size===size && a.color===color));
  persistCart(); updateCartBadge(); toast('Удалено'); renderCart();
}

export function checkoutInTelegram(items){
  const tg=window.Telegram?.WebApp;
  const tgUser = tg?.initDataUnsafe?.user ? {
    id: tg.initDataUnsafe.user.id, username: tg.initDataUnsafe.user.username || null,
    first_name: tg.initDataUnsafe.user.first_name || null, last_name: tg.initDataUnsafe.user.last_name || null
  } : null;
  const order = {
    cart: items.map(x=>({id:x.product.id,title:x.product.title,price:x.product.price,qty:x.qty,size:x.size||null,color:x.color||null})),
    total: items.reduce((s,x)=> s + x.qty * x.product.price, 0),
    currency:'USD', comment:'', user: tgUser, ts: Date.now()
  };
  const payload = JSON.stringify(order);
  if (tg?.sendData){ tg.sendData(payload); toast('Заказ отправлен менеджеру в Telegram'); }
  else { navigator.clipboard.writeText(payload); toast('WebApp вне Telegram: заказ (JSON) скопирован'); }
}
