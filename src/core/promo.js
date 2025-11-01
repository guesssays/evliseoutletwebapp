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
    // Если эти поля пустые — мы аккуратно засеем тестовые 6 позиций на лету
    discounts: {},
    x2CashbackIds: [],
  };
}

function promoConfig() {
  const cfg = state?.promo || {};
  const d = defaults();
  return { ...d, ...cfg, theme: { ...d.theme, ...(cfg.theme||{}) } };
}

/* ===== helpers ===== */
function _ensureArrays(obj) {
  if (!obj) return { discounts:{}, x2CashbackIds:[] };
  if (!obj.discounts || typeof obj.discounts !== 'object') obj.discounts = {};
  if (!Array.isArray(obj.x2CashbackIds)) obj.x2CashbackIds = [];
  return obj;
}

/**
 * Аккуратно засеять тестовую акцию на 6 товаров (3 скидки, 3 x2),
 * если в state.promo ничего не выставлено вручную.
 * НИЧЕГО не делаем, если:
 *   - акция выключена, или
 *   - уже есть явные скидки/x2, или
 *   - нет товаров
 */
export function ensureTestPromoSeed() {
  const cfg = state?.promo;
  if (!cfg || !cfg.enabled) return;

  _ensureArrays(cfg);

  const goods = Array.isArray(state.products) ? state.products.slice(0) : [];
  if (goods.length < 6) return;

  // 3.1) если НЕТ явных скидок — засеем 3 шт. -20%
  const hasManualDiscounts = Object.keys(cfg.discounts||{}).length > 0;
  if (!hasManualDiscounts){
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

  // 3.2) гарантируем минимум 3 x2-позиции: добираем из не-дискаунтных
  const needX2Min = 3;
  const existingX2 = new Set(cfg.x2CashbackIds || []);
  if (existingX2.size < needX2Min){
    const discountIds = new Set(Object.keys(state.promo.discounts || {}));
    for (const p of goods){
      const id = String(p.id);
      if (existingX2.size >= needX2Min) break;
      if (discountIds.has(id)) continue;     // не мешаем скидкам
      if (existingX2.has(id)) continue;
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

/** На главной при активной акции показываем всё (включая акционные). */
export function shouldShowOnHome(p) {
  return promoIsActive() ? true : !isLimitedProduct(p);
}

export function promoTitle(){ return (state?.promo?.title) || 'Новогодняя акция'; }
export function promoSubtitle(){ return (state?.promo?.subtitle) || 'скидки и x2 кэшбек'; }

/* ===== THEME APPLY/CLEAR ===== */
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
