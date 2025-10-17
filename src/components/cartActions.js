import { state, persistCart, updateCartBadge } from '../core/state.js';
import { toast } from '../core/toast.js';

export function addToCart(product, size, color, qty){
  const key = (a)=> a.productId===product.id && (a.size||null)===(size||null) && (a.color||null)===(color||null);
  const ex = state.cart.items.find(key);
  if (ex) ex.qty += qty;
  else state.cart.items.push({ productId: product.id, size: size||null, color: color||null, qty });
  persistCart(); updateCartBadge();
  toast('Товар добавлен в корзину');
}
