import { userScopedKey } from '../core/utils.js';
import { openModal } from '../core/modal.js';
import { t } from '../core/i18n.js';

const ONBOARDING_KEY = ()=> userScopedKey('evlise_onboarding_seen');
let currentOnboardingIndex = 0;

export function showOnboardingOnce(){
  const force = new URLSearchParams((location.hash.split('?')[1] || '')).get('ob') === '1';
  const seen = localStorage.getItem(ONBOARDING_KEY()) === '1';
  if (seen && !force) return;
  currentOnboardingIndex = 0;
  openModal({ title:'', body:`<div class="ob"></div>`, actions:[], onOpen:()=>{
    document.querySelector('#modal').classList.add('blur-heavy');
    renderOnboardingSlide(currentOnboardingIndex);
  }});
}
export function renderOnboardingSlide(i){
  const slides=getOnboardingSlides();
  currentOnboardingIndex = Math.max(0, Math.min(i, slides.length-1));
  const s=slides[currentOnboardingIndex];
  const body=document.querySelector('#modalBody');
  body.innerHTML = `
    <div class="ob">
      <div class="ob-ill">${s.ill}</div>
      <div class="ob-title">${s.title}</div>
      <div class="ob-desc">${s.desc.replace(/\n/g,'<br>')}</div>
      <div class="ob-dots">${slides.map((_,idx)=>`<span class="dot ${idx===currentOnboardingIndex?'active':''}"></span>`).join('')}</div>
    </div>`;
  const actions=document.querySelector('#modalActions'); actions.innerHTML='';
  if (currentOnboardingIndex < slides.length - 1){
    const skip=document.createElement('button'); skip.className='btn secondary'; skip.textContent=t('ob_skip'); skip.onclick=finishOnboarding; actions.appendChild(skip);
  }else{ const spacer=document.createElement('div'); spacer.style.flex='1'; spacer.style.visibility='hidden'; actions.appendChild(spacer); }
  const primary=document.createElement('button'); primary.className='btn';
  primary.textContent = currentOnboardingIndex===0? t('ob_start') : currentOnboardingIndex<slides.length-1? t('ob_next') : t('ob_start');
  primary.onclick = ()=>{ if (currentOnboardingIndex < slides.length - 1) renderOnboardingSlide(currentOnboardingIndex+1); else finishOnboarding(); };
  actions.appendChild(primary);
}
function finishOnboarding(){ localStorage.setItem(ONBOARDING_KEY(), '1'); document.querySelector('#modal').classList.remove('show'); }
function svgPhone(content){ return `<svg viewBox="0 0 280 220" class="ob-svg" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><rect x="70" y="10" rx="18" ry="18" width="140" height="200" fill="currentColor" opacity=".06"/><rect x="85" y="30" rx="12" ry="12" width="110" height="160" fill="currentColor" opacity=".08"/>${content}</svg>`; }
function illActions(){ return svgPhone(`<circle cx="140" cy="170" r="28" stroke="currentColor" stroke-width="2" fill="none"/><path d="M140 158 v24 M128 170 h24" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M100 170 a10 10 0 1 0 20 0 a10 10 0 1 0 -20 0" fill="none" stroke="currentColor" stroke-width="2"/><path d="M180 170 l14 -14 M194 170 l-14 -14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><rect x="95" y="60" width="90" height="60" rx="8" fill="currentColor" opacity=".12"/>`); }
function illFilters(){ return svgPhone(`<rect x="95" y="60" width="90" height="44" rx="8" fill="currentColor" opacity=".12"/><rect x="95" y="110" width="28" height="10" rx="4" fill="currentColor" opacity=".25"/><rect x="128" y="110" width="28" height="10" rx="4" fill="currentColor" opacity=".18"/><rect x="161" y="110" width="24" height="10" rx="4" fill="currentColor" opacity=".1"/><path d="M150 150 l10 12 l10 -20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><rect x="180" y="30" width="22" height="8" rx="4" fill="currentColor" opacity=".25"/>`); }
function illGallery(){ return svgPhone(`<rect x="95" y="54" width="90" height="70" rx="8" fill="currentColor" opacity=".12"/><rect x="100" y="130" width="22" height="22" rx="4" fill="currentColor" opacity=".25"/><rect x="126" y="130" width="22" height="22" rx="4" fill="currentColor" opacity=".18"/><rect x="152" y="130" width="22" height="22" rx="4" fill="currentColor" opacity=".12"/><rect x="178" y="130" width="22" height="22" rx="4" fill="currentColor" opacity=".06"/>`); }
function illCart(){ return svgPhone(`<rect x="100" y="70" width="80" height="18" rx="6" fill="currentColor" opacity=".12"/><rect x="100" y="96" width="80" height="18" rx="6" fill="currentColor" opacity=".12"/><circle cx="120" cy="146" r="12" fill="none" stroke="currentColor" stroke-width="2"/><path d="M112 146 h16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><rect x="148" y="136" width="32" height="20" rx="10" fill="currentColor" opacity=".18"/>`); }
function illWelcome(){ return svgPhone(`<rect x="100" y="70" width="80" height="60" rx="12" fill="currentColor" opacity=".12"/><path d="M120 94 l20 20 M140 94 l-20 20" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>`); }
function getOnboardingSlides(){ return [
  { title: t('ob_welcome_t'), desc: t('ob_welcome_d'), ill: illWelcome() },
  { title: t('ob_actions_t'), desc: t('ob_actions_d'), ill: illActions() },
  { title: t('ob_filters_t'), desc: t('ob_filters_d'), ill: illFilters() },
  { title: t('ob_gallery_t'), desc: t('ob_gallery_d'), ill: illGallery() },
  { title: t('ob_cart_t'), desc: t('ob_cart_d'), ill: illCart() },
]; }
