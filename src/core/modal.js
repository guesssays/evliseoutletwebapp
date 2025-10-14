import { modalEls } from './dom.js';
export function openModal({title, body, actions=[], onOpen}){
  const {modal, title:mt, body:mb, actions:ma} = modalEls();
  mt.textContent = title || '';
  mb.innerHTML = body || '';
  ma.innerHTML = '';
  actions.forEach(a=>{
    const b=document.createElement('button');
    b.className='btn' + (a.variant==='secondary'?' secondary':''); b.textContent=a.label;
    b.onclick = a.onClick || closeModal; ma.appendChild(b);
  });
  modal.classList.add('show'); modal.setAttribute('aria-hidden','false');
  if (onOpen) onOpen();
  if (window.lucide?.createIcons) lucide.createIcons();
}
export function closeModal(){
  const {modal} = modalEls();
  modal.classList.remove('show'); modal.classList.remove('blur-heavy'); modal.setAttribute('aria-hidden','true');
}
