// src/core/cart.js (или ваш путь к модулю корзины)
import { state, persistCart, updateCartBadge } from '../core/state.js';
import { toast } from '../core/toast.js';

export function addToCart(product, size, color, qty){
  const key = (a)=> String(a.productId)===String(product.id)
    && (a.size||null)===(size||null)
    && (a.color||null)===(color||null);

  const ex = state.cart.items.find(key);
  if (ex) ex.qty += qty;
  else state.cart.items.push({
    productId: String(product.id),          // всегда строкой → унифицировано
    size: size||null,
    color: color||null,
    qty
  });

  persistCart();
  updateCartBadge();

  // динамический остров: зелёный тост с галочкой
  toast('Товар добавлен в корзину', { variant: 'ok', icon: 'check' });
}

export function removeLineFromCart(productId, size, color){
  const before = state.cart.items.length;

  state.cart.items = state.cart.items.filter(a => !(
    String(a.productId)===String(productId) &&
    (a.size||null)===(size||null) &&
    (a.color||null)===(color||null)
  ));

  persistCart();
  updateCartBadge();

  if (state.cart.items.length < before) {
    // жёлтый тост с иконкой корзины/удаления
    toast('Товар убран из корзины', { variant: 'warn', icon: 'trash-2' });
  }
}

export function isInCart(productId, size, color){
  return state.cart.items.some(a =>
    String(a.productId)===String(productId) &&
    (a.size||null)===(size||null) &&
    (a.color||null)===(color||null)
  );
}
