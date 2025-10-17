import { el } from './utils.js';

export function openModal({title='', body='', actions=[], onOpen}){
  const m = el('#modal');
  el('#modalTitle').textContent = title;
  el('#modalBody').innerHTML = body;
  const act = el('#modalActions'); act.innerHTML='';
  actions.forEach(a=>{
    const b=document.createElement('button'); b.className='pill'; b.textContent=a.label;
    if(a.variant==='primary'){ b.classList.add('primary'); }
    b.onclick = ()=>{ a.onClick && a.onClick(); };
    act.appendChild(b);
  });
  m.classList.add('show'); m.setAttribute('aria-hidden','false');
  el('#modalClose').onclick=()=> closeModal();
  onOpen && onOpen();
}
export function closeModal(){
  const m=document.getElementById('modal');
  if(!m) return;
  m.classList.remove('show');
  m.setAttribute('aria-hidden','true');
}
