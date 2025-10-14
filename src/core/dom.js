export const el = (s)=>document.querySelector(s);
export const view = ()=> el('#view');
export const drawer = ()=> el('#drawer');
export const overlay = ()=> el('#overlay');
export const modalEls = ()=> ({
  modal: el('#modal'),
  title: el('#modalTitle'),
  body: el('#modalBody'),
  actions: el('#modalActions')
});
