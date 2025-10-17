export const tg = window.Telegram?.WebApp || null;

export function initTelegramChrome(){
  if (!tg) return;
  try { tg.ready(); } catch(e){}
  try { tg.expand(); } catch(e){}
  try { tg.setHeaderColor('#0a0a0a'); } catch(e){}
  try { tg.setBackgroundColor('#0a0a0a'); } catch(e){}
}

export const el  = (sel)=> document.querySelector(sel);
export const els = (sel)=> Array.from(document.querySelectorAll(sel));
export const byId = (id)=> document.getElementById(id);

export const priceFmt = (n)=> new Intl.NumberFormat('ru-RU', {
  style:'currency', currency:'UZS', maximumFractionDigits:0
}).format(n);

export const colorToHex = (name)=>{
  const m = { Black:'#121111', White:'#F2F2F2', Gray:'#A3A1A2' };
  return m[name] || name;
};
