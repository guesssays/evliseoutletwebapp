// src/core/promo.js
import { state } from './state.js';

function defaults() {
  return {
    enabled: false,
    slug: 'newyear-2026',
    title: 'Новогодняя акция',
    subtitle: 'скидки и x2 кэшбек',
    banners: [
      { id: 'bn1', img: 'assets/promo/newyear/banner-1.jpg', alt: 'Новогодняя акция — скидки и x2 кэшбек' },
      { id: 'bn2', img: 'assets/promo/newyear/banner-2.jpg', alt: 'Новогодняя коллекция — большие скидки' },
      { id: 'bn3', img: 'assets/promo/newyear/banner-3.jpg', alt: 'Хиты сезона — x2 кэшбек' },
    ],
    theme: {
      pageBg:    '#0b1220',
      pageBgImg: 'assets/promo/newyear/bg-snow.svg',
      pageTint:  'rgba(255,255,255,.02)',
      gridBg:    'transparent',
      gridBgImage: '',
      gridTint:  '',
      badgeColor:   '#ef4444',
      badgeX2Color: '#06b6d4',
    },
    discounts: {},        // { [productId]: { oldPrice, price } }
    x2CashbackIds: [],    // [productId]
  };
}

function promoConfig() {
  const cfg = state?.promo || {};
  return { ...defaults(), ...cfg, theme: { ...defaults().theme, ...(cfg.theme||{}) } };
}

/* ===== API ===== */
export function promoIsActive() { return !!promoConfig().enabled; }
export function getPromoBanners() { return promoConfig().banners || []; }
export function promoTheme() { return promoConfig().theme || {}; }

/** Участвует в скидке как «лимитка» */
export function isDiscountedProduct(p) {
  const d = promoConfig().discounts || {};
  const info = d?.[String(p.id)];
  return !!info && isFinite(info.price) && info.price > 0;
}

/** Информация о скидке — ТОЛЬКО пока акция активна */
export function discountInfo(p) {
  if (!promoIsActive()) return null; // ключевой «гейт»
  const d = promoConfig().discounts || {};
  const info = d?.[String(p.id)];
  if (!info) return null;
  const oldP = Number(info.oldPrice || p.price || 0);
  const newP = Number(info.price    || p.price || 0);
  const pct  = oldP > 0 ? Math.round((1 - newP / oldP) * 100) : 0;
  return { oldPrice: oldP, newPrice: newP, percent: Math.max(0, pct) };
}

export function isX2CashbackProduct(p) {
  const ids = promoConfig().x2CashbackIds || [];
  return ids.includes(String(p.id));
}

/** Итоговая цена (для скидочных товаров во время акции) */
export function effectivePrice(p) {
  const di = discountInfo(p);
  return di ? di.newPrice : Number(p.price || 0);
}

/**
 * Бейджи для любой сетки/карточки: только при активной акции.
 * - скидка имеет приоритет над x2
 */
export function promoBadgesFor(p) {
  if (!promoIsActive()) return [];
  const badges = [];
  if (isDiscountedProduct(p)) {
    const di = discountInfo(p);
    badges.push({ type: 'discount', label: `-${di.percent}%` });
    return badges;
  }
  if (isX2CashbackProduct(p)) {
    badges.push({ type: 'x2', label: 'x2 кэшбек' });
  }
  return badges;
}

/** Товар входит в акцию (для страницы акции) */
export function productInPromo(p) {
  if (!promoIsActive()) return false;
  return isDiscountedProduct(p) || isX2CashbackProduct(p);
}

/** Лимитка = скидочный промо-товар */
export function isLimitedProduct(p) { return isDiscountedProduct(p); }

/**
 * Показывать ли товар в общей сетке (Home):
 * - во время акции — показываем всех (и лимитки, и обычные)
 * - после — скрываем лимитки из Home
 */
export function shouldShowOnHome(p) {
  return promoIsActive() ? true : !isLimitedProduct(p);
}

export function promoTitle(){ return (state?.promo?.title) || 'Новогодняя акция'; }
export function promoSubtitle(){ return (state?.promo?.subtitle) || 'скидки и x2 кэшбек'; }
