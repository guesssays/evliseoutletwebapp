// src/core/promo.js
import { state } from './state.js';

function defaults() {
  return {
    enabled: false,
    slug: 'newyear-2026',
    title: 'Новогодняя акция',

    banners: [
      { id: 'bn1', img: 'assets/promo/newyear/banner-100.jpg', alt: 'Новогодняя акция — скидки и x2 кэшбек' },
      { id: 'bn2', img: 'assets/promo/newyear/banner-200.jpg', alt: 'Новогодняя коллекция — большие скидки' },
      { id: 'bn3', img: 'assets/promo/newyear/banner-300.jpg', alt: 'Хиты сезона — x2 кэшбек' },
    ],
    theme: {
      /* === BORDEAUX palette === */
      pageBg:      '#3e0a0a',
      pageBg2:     '#5a0f12',
      // внимание: в проекте сохранялась эта строка дважды — оставляем один корректный ключ:
      pageBgImg:   'assets/promo/newyear/xmas-pattern5.svg',
      pageTint:    'rgba(255,255,255,.03)',

      gridBg:      'transparent',
      gridBgImage: '',
      gridTint:    '',

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
  return { ...d, ...cfg, theme: { ...d.theme, ...(cfg.theme || {}) } };
}

/* ===== helpers ===== */
function _ensureArrays(obj) {
  if (!obj) return { discounts:{}, x2CashbackIds:[] };
  if (!obj.discounts || typeof obj.discounts !== 'object') obj.discounts = {};
  if (!Array.isArray(obj.x2CashbackIds)) obj.x2CashbackIds = [];
  return obj;
}

export function ensureTestPromoSeed() {
  if (!promoIsActive()) return;

  if (!state.promo) state.promo = defaults();
  _ensureArrays(state.promo);

  const goods = Array.isArray(state.products) ? state.products.slice(0) : [];
  if (goods.length < 6) return;

  const hasManualDiscounts = Object.keys(state.promo.discounts || {}).length > 0;
  if (!hasManualDiscounts) {
    const sample = goods.slice(0, 3);
    const disc = {};
    for (const p of sample) {
      const oldP = Number(p.price || 0);
      if (!isFinite(oldP) || oldP <= 0) continue;
      const newP = Math.max(1, Math.round(oldP * 0.8));
      disc[String(p.id)] = { oldPrice: oldP, price: newP };
    }
    state.promo.discounts = disc;
  }

  const needX2Min = 3;
  const existingX2 = new Set(state.promo.x2CashbackIds || []);
  if (existingX2.size < needX2Min) {
    const discountIds = new Set(Object.keys(state.promo.discounts || {}));
    for (const p of goods) {
      const id = String(p.id);
      if (existingX2.size >= needX2Min) break;
      if (discountIds.has(id)) continue;
      existingX2.add(id);
    }
    state.promo.x2CashbackIds = [...existingX2];
  }
}

/* ===== STATE API ===== */
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
  const oldP = Number(info.oldPrice ?? p.price ?? 0);
  const newP = Number(info.price    ?? p.price ?? 0);
  const pct  = oldP > 0 ? Math.round((1 - newP / oldP) * 100) : 0;
  return { oldPrice: oldP, newPrice: newP, percent: Math.max(0, pct) };
}

export function isX2CashbackProduct(p) {
  const ids = promoConfig().x2CashbackIds || [];
  return promoIsActive() && ids.includes(String(p.id));
}

export function effectivePrice(p) {
  const di = discountInfo(p);
  return di ? di.newPrice : Number(p.price || 0);
}

/**
 * Бейджи для карточки:
 * - если есть скидка → показываем %-бейдж
 * - если есть x2 → ДОПОЛНИТЕЛЬНО показываем бейдж x2 (раньше x2 терялся при скидке)
 */
export function promoBadgesFor(p) {
  if (!promoIsActive()) return [];
  const badges = [];
  if (isDiscountedProduct(p)) {
    const di = discountInfo(p);
    badges.push({ type: 'discount', label: `-${di.percent}%` });
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
export function promoSubtitle(){
  const s = (state?.promo?.subtitle ?? '').trim();
  return s; // пустая строка → ничего не рендерим
}


export function applyPromoTheme(on = true) {
  try {
    const root = document.documentElement;
    const v = document.getElementById('view');
    if (!v) return;

    if (on) {
      const th = promoTheme();
      root.classList.add('theme-xmas');

      if (th.pageBg)  root.style.setProperty('--xmas-bg', th.pageBg);
      if (th.pageBg2) root.style.setProperty('--xmas-bg-2', th.pageBg2);

      v.classList.add('promo-page');
      v.style.setProperty('--promo-page-bg', th.pageBg || '#3e0a0a');

      if (th.pageBgImg) {
        const url = `url('${th.pageBgImg}')`;
        v.style.setProperty('--promo-bg-img', url);
      } else {
        v.style.removeProperty('--promo-bg-img');
      }

      if (th.gridBg)      v.style.setProperty('--promo-grid-bg', th.gridBg);
      if (th.gridBgImage) v.style.setProperty('--promo-grid-img', th.gridBgImage);
      if (th.gridTint)    v.style.setProperty('--promo-grid-tint', th.gridTint);

    } else {
      root.classList.remove('theme-xmas');
      root.style.removeProperty('--xmas-bg');
      root.style.removeProperty('--xmas-bg-2');

      v.classList.remove('promo-page');
      v.style.removeProperty('--promo-page-bg');
      v.style.removeProperty('--promo-bg-img');
      v.style.removeProperty('--promo-grid-bg');
      v.style.removeProperty('--promo-grid-img');
      v.style.removeProperty('--promo-grid-tint');
    }
  } catch {}
}

export function clearPromoTheme() {
  applyPromoTheme(false);
}
