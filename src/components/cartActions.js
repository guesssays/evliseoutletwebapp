import { state, persistCart, updateCartBadge } from '../core/state.js';
import { toast } from '../core/toast.js';

export function addToCart(product, size, color, qty=1){
  const same=(a)=> a.productId===product.id && a.size===size && a.color===color;
  const existing = state.cart.items.find(same);
  if (existing) existing.qty+=qty; else state.cart.items.push({productId:product.id, size, color, qty});
  persistCart(); updateCartBadge(); toast('Добавлено в корзину');
}
