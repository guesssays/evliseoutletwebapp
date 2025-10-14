export function toast(msg){
  const wrap = document.querySelector('#toastWrap'); if (!wrap) return;
  const n = document.createElement('div'); n.className='toast'; n.textContent=msg;
  wrap.appendChild(n); setTimeout(()=>n.remove(), 2500);
}
export function updateToastTop(){
  const h = document.querySelector('#appHeader')?.offsetHeight || 56;
  document.documentElement.style.setProperty('--toastTop', `${h + 8}px`);
}
