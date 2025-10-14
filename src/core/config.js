export const PRICE_CURRENCY = 'UZS';
export const RUB_TO_UZS = 1;
export const DEFAULT_LANG  = localStorage.getItem('evlise_lang')  || 'ru';
export const DEFAULT_THEME = localStorage.getItem('evlise_theme') || (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');

export const tg = window.Telegram?.WebApp;
export function initTelegramChrome(){
  if (!tg) return;
  tg.ready();
  tg.expand();
  try{ tg.setHeaderColor('#0a0a0a'); }catch(e){}
  try{ tg.setBackgroundColor('#0a0a0a'); }catch(e){}
}
