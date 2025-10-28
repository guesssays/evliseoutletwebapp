// src/components/ProductFixHeader.js
// Лёгкий фикс-хедер товара: две кнопки (назад и избранное), автопоказ после прокрутки.

let unsub = null;

function qs(id) { return document.getElementById(id); }
function staticHeader() { return document.querySelector('.app-header'); }
function fixHdr() { return qs('productFixHdr'); }
function btnBack() { return qs('btnFixBack'); }
function btnFav() { return qs('btnFixFav'); }

function toggleFixHeader(show) {
  const wrap = fixHdr();
  if (!wrap) return;
  wrap.classList.toggle('show', !!show);
  wrap.setAttribute('aria-hidden', show ? 'false' : 'true');
}

export function setFavActive(on) {
  const b = btnFav();
  if (!b) return;
  b.classList.toggle('active', !!on);
  b.setAttribute('aria-pressed', on ? 'true' : 'false');
}

export function activateProductFixHeader({
  isFav = () => false,
  onBack = () => history.back(),
  onFavToggle = () => {},
  showThreshold = 120, // px прокрутки до показа
} = {}) {
  try {
    const wrap = fixHdr();
    if (!wrap) return;

    // при входе на страницу товара — гарантируем видимость статичного хедера,
    // а фикс-хедер стартует скрытым и появляется по скроллу
    staticHeader()?.classList.remove('hidden');
    toggleFixHeader(false);

    const onScroll = () => {
      const y = Math.max(document.documentElement.scrollTop || 0, window.scrollY || 0);
      const show = y > showThreshold;
      toggleFixHeader(show);
      // когда фикс-хедер показан — прячем статичный
      const stat = staticHeader();
      if (stat) stat.classList.toggle('hidden', show);
    };

    const onHash = () => {
      // выход со страницы товара — сразу скрываем слой и возвращаем статику
      const h = String(location.hash || '');
      if (!h.startsWith('#/product/') && !h.startsWith('#/p/')) {
        deactivateProductFixHeader();
      } else {
        setTimeout(onScroll, 0);
      }
    };

    // кнопки
    const back = btnBack();
    const fav = btnFav();
    if (back) back.onclick = (e) => { e.preventDefault(); onBack(); };
    if (fav) {
      setFavActive(!!isFav());
      fav.onclick = (e) => { e.preventDefault(); onFavToggle(); setFavActive(!!isFav()); };
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('hashchange', onHash);

    // первый расчёт
    onScroll();

    unsub = () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('hashchange', onHash);
      if (back) back.onclick = null;
      if (fav) fav.onclick = null;
    };

    // иконки
    try { window.lucide?.createIcons?.(); } catch {}
  } catch (e) {
    console.warn('[ProductFixHeader] activate failed', e);
  }
}

export function deactivateProductFixHeader() {
  try {
    unsub?.(); unsub = null;
    toggleFixHeader(false);
    // вернём статичный хедер
    staticHeader()?.classList.remove('hidden');
  } catch (e) {
    console.warn('[ProductFixHeader] deactivate failed', e);
  }
}

export default { activateProductFixHeader, deactivateProductFixHeader, setFavActive };
