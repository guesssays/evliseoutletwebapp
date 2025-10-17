let idx=0;
export function toast(msg){
  const w=document.getElementById('toastWrap');
  const id='t'+(++idx); const n=document.createElement('div');
  n.className='toast'; n.id=id; n.textContent=msg; w.appendChild(n);
  setTimeout(()=>{ n.style.opacity='0'; setTimeout(()=>n.remove(),300); }, 2200);
}
