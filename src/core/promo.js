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
      pageBg:    '#3e0a0a',
      pageBgImg: 'assets/promo/newyear/bg-snow-red.svg',
      pageTint:  'rgba(255,255,255,.03)',
      gridBg:    'transparent',
      gridBgImage: '',
      gridTint:  '',
      badgeColor:   '#ef4444',
      badgeX2Color: '#06b6d4',
    },
    discounts: {},
    x2CashbackIds: [],
  };
}

function promoConfig() {
  const cfg = state?.promo || {};
  const d = defaults();
  return { ...d, ...cfg, theme: { ...d.theme, ...(cfg.theme||{}) } };
}

/* ===== STATE ===== */
export function promoIsActive() { return !!promoConfig().enabled; }
export function getPromoBanners() { return promoConfig().banners || []; }
export function promoTheme() { return promoConfig().theme || {}; }

export function isDiscountedProduct(p) {
  const d = promoConfig().discounts || {};
  const info = d?.[String(p.id)];
  return !!info && isFinite(info.price) && info.price > 0;
}

export function discountInfo(p) {
  if (!promoIsActive()) return null;
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

export function effectivePrice(p) {
  const di = discountInfo(p);
  return di ? di.newPrice : Number(p.price || 0);
}

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

export function productInPromo(p) {
  if (!promoIsActive()) return false;
  return isDiscountedProduct(p) || isX2CashbackProduct(p);
}
export function isLimitedProduct(p) { return isDiscountedProduct(p); }
export function shouldShowOnHome(p) {
  return promoIsActive() ? true : !isLimitedProduct(p);
}

export function promoTitle(){ return (state?.promo?.title) || 'Новогодняя акция'; }
export function promoSubtitle(){ return (state?.promo?.subtitle) || 'скидки и x2 кэшбек'; }

/* ===== THEME APPLY/CLEAR (единые утилиты) ===== */
export function applyPromoTheme(on = true) {
  try {
    const root = document.documentElement;
    const v = document.getElementById('view');
    if (!v) return;

    if (on) {
      const th = promoTheme();
      root.classList.add('theme-xmas');

      v.classList.add('promo-page');
      v.style.setProperty('--promo-page-bg', th.pageBg || '#3e0a0a');
      v.style.setProperty('--promo-page-tint', th.pageTint || 'rgba(255,255,255,.03)');
      if (th.pageBgImg) {
        v.style.backgroundImage = `url('${th.pageBgImg}')`;
        v.style.backgroundRepeat = 'repeat';
        v.style.backgroundSize = '420px';
      } else {
        v.style.backgroundImage = 'none';
      }
    } else {
      root.classList.remove('theme-xmas');

      v.classList.remove('promo-page');
      v.style.removeProperty('--promo-page-bg');
      v.style.removeProperty('--promo-page-tint');
      v.style.backgroundImage = 'none';
      v.style.backgroundRepeat = '';
      v.style.backgroundSize = '';
    }
  } catch {}
}

export function clearPromoTheme() {
  applyPromoTheme(false);
}
