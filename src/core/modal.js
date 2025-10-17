export function openModal({title='', body='', actions=[], onOpen}){
  const m = document.getElementById('modal');
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalBody').innerHTML = body;
  const act = document.getElementById('modalActions'); act.innerHTML='';
  actions.forEach(a=>{
    const b=document.createElement('button'); b.className='pill'; b.textContent=a.label;
    if(a.variant==='primary'){ b.classList.add('primary'); }
    b.onclick = ()=>{ a.onClick && a.onClick(); };
    act.appendChild(b);
  });
  m.classList.add('show');
  document.getElementById('modalClose').onclick=()=> closeModal();
  onOpen && onOpen();
}
export function closeModal(){ document.getElementById('modal').classList.remove('show'); }
