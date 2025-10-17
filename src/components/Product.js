import { state } from '../core/state.js';
import { t } from '../core/i18n.js';
import { priceFmt, getCategoryName, renderSizeChartHTML, colorToHex } from '../core/utils.js';
import { el } from '../core/dom.js';
import { addToCart } from './Cart.js';
import { openModal, closeModal } from '../core/modal.js';

export function renderProduct({id}){
  closeDrawerIfNeeded();
  const p = state.products.find(x=> String(x.id)===String(id)); if (!p){ location.hash='#/'; return; }
  const sizes = p.sizes || []; const colors = p.colors || [];
  const view=document.querySelector('#view');
  view.innerHTML = `
    <div class="product">
      <div class="p-gallery" id="gWrap">
        <img id="gMain" src="${p.images[0]}" alt="${p.title}"/>
        <div class="gallery-strip" id="gStrip"></div>
        <div class="real-photos"><h3>Реальные фото</h3><div class="strip" id="realStrip"></div></div>
      </div>
      <div class="p-panel">
        <div class="h1">${p.title}</div>
        <div class="sub">${p.subtitle || ''}</div>
        <div class="price">${priceFmt(p.price)}</div>
        ${sizes.length ? `<div class="h2">${t('size')}</div><div class="size-grid" id="sizeGrid"></div>` : ''}
        ${colors.length ? `<div class="h2" style="margin-top:8px">${t('color')}</div><div class="color-grid" id="colorGrid"></div>` : ''}
        <div class="hr"></div>
        <div class="h2">${t('description')}</div>
        <div>${p.description}</div>
        <div class="kv-ico">
          <div class="kv-row"><i data-lucide="folder"></i><span>${t('category')}</span><b>${getCategoryName(p.category)}</b></div>
          <div class="kv-row"><i data-lucide="layers"></i><span>${t('material')}</span><b>${p.material || '—'}</b></div>
          <div class="kv-row"><i data-lucide="hash"></i><span>${t('sku')}</span><b>${p.sku || p.id}</b></div>
        </div>
        ${p.sizeChart ? `<div class="hr"></div><div class="h2">${t('sizeChart')}</div>${renderSizeChartHTML(p.sizeChart)}` : ''}
      </div>
    </div>
    <div class="action-bar" id="actionBar">
      <a class="action-btn" id="homeBtn" data-tip="Главная" href="#/"><i data-lucide="home"></i></a>
      <button class="action-btn primary" id="cartBtn" data-tip="Добавить в корзину"><i data-lucide="plus"></i></button>
    </div>`;

  const strip=el('#gStrip'); (p.images||[]).forEach((src,idx)=>{ const im=new Image(); im.src=src; im.alt=p.title+' '+(idx+1); im.onclick=()=> el('#gMain').src=src; strip.appendChild(im); });
  const realStrip=el('#realStrip'); (p.realPhotos||[]).forEach(src=>{ const im=new Image(); im.src=src; im.alt=p.title+' real'; im.onclick=()=> openImageFullscreen(src); realStrip.appendChild(im); });

  const sg = el('#sizeGrid'); let selectedSize=null;
  (sizes||[]).forEach(s=>{ const b=document.createElement('button'); b.className='size'; b.textContent=s; b.onclick=()=>{ sg.querySelectorAll('.size').forEach(x=>x.classList.remove('active')); b.classList.add('active'); selectedSize=s; }; sg.appendChild(b); });
  let selectedColor=null; if (colors.length){ const cg=el('#colorGrid'); colors.forEach(c=>{ const btn=document.createElement('button'); btn.className='swatch'; btn.title=c; btn.style.background=colorToHex(c); btn.onclick=()=>{ cg.querySelectorAll('.swatch').forEach(x=>x.classList.remove('active')); btn.classList.add('active'); selectedColor=c; }; cg.appendChild(btn); }); }

  const cartBtn=el('#cartBtn');
  cartBtn.onclick=()=>{ addToCart(p, selectedSize, selectedColor); cartBtn.innerHTML='<i data-lucide="shopping-bag"></i>'; cartBtn.setAttribute('data-tip','Перейти в корзину'); cartBtn.onclick=()=> location.hash='#/cart'; if (window.lucide?.createIcons) lucide.createIcons(); };
  if (window.lucide?.createIcons) lucide.createIcons();
}

export function openImageFullscreen(src){
  openModal({ title:'', body:`<img src="${src}" alt="" style="width:100%;height:auto;display:block;border-radius:12px">`, actions:[{label:'OK', onClick: closeModal}] });
}
function closeDrawerIfNeeded(){ const d=document.querySelector('#drawer'); const o=document.querySelector('#overlay'); d.classList.remove('open'); o.classList.remove('show'); }
