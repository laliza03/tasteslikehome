'use strict';
const config = window.SHOP_CONFIG;
const translations = window.SHOP_TRANSLATIONS;
const $ = (selector, parent = document) => parent.querySelector(selector);
const $$ = (selector, parent = document) => [...parent.querySelectorAll(selector)];
const locales = {en:'en-CA', fr:'fr-CA', ar:'ar-DZ-u-nu-arab'};
let language = translations[document.documentElement.lang] ? document.documentElement.lang : 'en';
let activeFilter = 'all';
let activeProduct = null;
let messageView = '';
let products = [
  {id:'flowers',category:'algerian',units:12,price:30,image:'flowers.webp',allergens:'allergensNuts'},
  {id:'sables',category:'algerian',units:12,price:28,image:'sables.webp',allergens:'allergensNuts'},
  {id:'chocolate',category:'american',units:6,price:18,image:'chocolate.webp',allergens:'allergensGeneral'},
  {id:'brownies',category:'american',units:4,price:20,image:'brownies.webp',allergens:'allergensGeneral'},
  {id:'assortment',category:'events',units:24,price:54,image:'hero.webp',allergens:'allergensNuts'},
  {id:'custom',category:'events',units:null,price:null,image:'events.webp',allergens:'allergensCustom'},
];
const byId = new Map(products.map(product => [product.id, product]));
function t(key, values={}) {
  const value = key.split('.').reduce((object, part) => object?.[part], translations[language]);
  if (typeof value !== 'string') throw new Error(`Missing ${language} translation: ${key}`);
  return value.replace(/\{(\w+)\}/g, (match, name) => values[name] ?? match);
}
const number = value => new Intl.NumberFormat(locales[language]).format(value);
const money = value => new Intl.NumberFormat(locales[language], {style:'currency',currency:config.currency,currencyDisplay:'code',minimumFractionDigits:2,maximumFractionDigits:2}).format(value);
const pack = product => product.units ? t(language==='ar'&&product.units>=3&&product.units<=10?'packFew':'pack',{count:number(product.units)}) : t('madeToOrder');
const productText = product => {
  if(!product.translations)return translations[language].products[product.id];
  const choices=[language,...['fr','en','ar'].filter(value=>value!==language)];
  const fields=['name','description','detail','allergens','alt'];
  const text=Object.fromEntries(fields.map(key=>[key,choices.map(lang=>product.translations[lang]?.[key]).find(Boolean)||'']));
  text.detail||=text.description;text.alt||=text.name;
  return text;
};
const productImage = product => product.images?.[0] || './assets/'+product.image;
let kitchenPosts=[],shopSettings=null,contentRevision=-1,activePost=null;

const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const icon = name => `<i class="icon" data-icon="${name}" aria-hidden="true"></i>`;
const priceHtml = value => `<bdi>${escapeHtml(money(value))}</bdi>`;
function hydrateIcons(parent=document) {
  $$('[data-icon]',parent).forEach(el => el.style.setProperty('--icon',`url("./assets/icons/${el.dataset.icon}.svg")`));
}
let cart = {};
try {
  const saved = JSON.parse(localStorage.getItem('tasteslikehome-bag-v1') || '{}');
  if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
    for (const [id,qty] of Object.entries(saved)) {
      if (byId.has(id) && byId.get(id).price !== null && Number.isInteger(qty) && qty > 0 && qty <= 99) cart[id]=qty;
    }
  }
} catch {}
function persist() { try { localStorage.setItem('tasteslikehome-bag-v1',JSON.stringify(cart)); } catch {} }
const cartCount = () => Object.values(cart).reduce((sum,qty)=>sum+qty,0);
const cartTotal = () => Object.entries(cart).reduce((sum,[id,qty])=>sum+byId.get(id).price*qty,0);
let toastTimer;
function toast(message) {
  const el=$('#toast'); el.textContent=message; el.classList.add('visible');
  clearTimeout(toastTimer); toastTimer=setTimeout(()=>el.classList.remove('visible'),3000);
}
let lastTrigger;
function openDialog(id, trigger=document.activeElement) {
  const dialog=$(id);
  $$('dialog[open]').forEach(open=>open.close());
  lastTrigger=trigger; dialog.showModal(); document.body.classList.add('modal-open');
}
function closeDialog(dialog) { dialog.close(); }
$$('dialog').forEach(dialog=>{
  dialog.addEventListener('click',event=>{
    if(event.target!==dialog)return;
    const r=dialog.getBoundingClientRect();
    if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)closeDialog(dialog);
  });
  dialog.addEventListener('close',()=>{
    if(!$('dialog[open]')) {
      document.body.classList.remove('modal-open');
      if(lastTrigger?.isConnected)lastTrigger.focus({preventScroll:true});
    }
  });
});
function renderProducts(filter=activeFilter) {
  activeFilter=filter;
  const list=products.filter(p=>filter==='all'||p.category===filter);
  $('#products').innerHTML=list.length?list.map(p=>{
    const text=productText(p), label=t(p.id==='custom'?'madeForEvent':p.category);
    return `<article class="product"><button class="product-photo" data-product="${p.id}" aria-label="${escapeHtml(t('viewProduct',{name:text.name}))}"><img src="${productImage(p)}" alt="${escapeHtml(text.alt)}" width="650" height="650" loading="lazy"></button><div class="product-info"><div class="product-meta"><span>${label}</span><span>${pack(p)}</span></div><button class="product-title" data-product="${p.id}" dir="auto">${escapeHtml(text.name)}</button><p class="product-description" dir="auto">${escapeHtml(text.description)}</p><div class="product-bottom"><span class="price">${p.price===null?t('byEnquiry'):priceHtml(p.price)}<small>${p.price===null?'':' / '+pack(p)}</small></span><button class="add-button" ${p.price===null?'data-open-custom':`data-add="${p.id}"`} aria-label="${escapeHtml(p.price===null?t('customEnquiry'):t('addProduct',{name:text.name}))}">${t(p.price===null?'enquire':'add')}${icon(p.price===null?'arrow-up-right':'plus')}</button></div></div></article>`;
  }).join(''):`<p class="no-products">${t('noProducts')}</p>`;
  hydrateIcons($('#products'));
}
function renderBag() {
  for(const id of Object.keys(cart))if(!byId.has(id)||byId.get(id).price===null)delete cart[id];
  const count=cartCount();
  $$('.bag-count').forEach(el=>el.textContent=number(count));
  $$('[data-open-bag]').forEach(el=>el.setAttribute('aria-label',t('openBag',{count:number(count)})));
  $('.dialog-count').textContent=number(count);
  for(const id of Object.keys(cart))if(!byId.has(id)||byId.get(id).price===null)delete cart[id];
  persist();
  const entries=Object.entries(cart);
  $('#bag-content').innerHTML=entries.length?entries.map(([id,qty])=>{
    const p=byId.get(id), text=productText(p);
    return `<div class="bag-item"><img src="${productImage(p)}" alt="${escapeHtml(text.alt)}" width="88" height="100"><div><h3 dir="auto">${escapeHtml(text.name)}</h3><p class="item-meta">${pack(p)} · ${priceHtml(p.price)}</p><div class="bag-item-bottom"><div class="quantity" aria-label="${escapeHtml(t('quantity',{name:text.name}))}"><button data-quantity="${id}" data-change="-1" aria-label="${escapeHtml(t('decrease',{name:text.name}))}">${icon('minus')}</button><output aria-label="${t('quantityCount',{count:number(qty)})}">${number(qty)}</output><button data-quantity="${id}" data-change="1" aria-label="${escapeHtml(t('increase',{name:text.name}))}" ${qty>=99?'disabled':''}>${icon('plus')}</button></div><span>${priceHtml(p.price*qty)}</span></div><button class="remove-button" data-remove="${id}">${t('remove')}</button></div></div>`;
  }).join(''):`<div class="bag-empty">${icon('bag')}<h3>${t('emptyTitle')}</h3><p>${t('emptyBody')}</p><button class="button button-blue" data-continue-shopping>${t('menuLink')}${icon('arrow-right')}</button></div>`;
  $('#bag-footer').hidden=!entries.length;
  $('#bag-footer').innerHTML=entries.length?`<div class="subtotal"><span>${t(cartHasSample()?'subtotal':'estimatedSubtotal')}</span><strong>${priceHtml(cartTotal())}</strong></div><p class="bag-note">${cartHasSample()?t('bagSample'):''} ${t(config.acceptingOrders?'bagOpen':'bagClosed')}</p><button class="button button-blue button-full" data-order-enquiry>${t(config.acceptingOrders?'orderEnquiry':'previewEnquiry')}${icon('arrow-up-right')}</button>`:'';
  hydrateIcons($('#bag-dialog'));
}
function addToBag(id) {
  if(!byId.has(id)||byId.get(id).price===null)return;
  cart[id]=Math.min(99,(cart[id]||0)+1);persist();renderBag();
  toast(t('added',{name:productText(byId.get(id)).name}));
}
function showProduct(id, shouldOpen=true) {
  const p=byId.get(id);if(!p)return;
  activeProduct=id;const text=productText(p);
  $('#product-detail').innerHTML=`<div class="product-detail"><div class="detail-image"><img id="detail-main-image" src="${productImage(p)}" alt="${escapeHtml(text.alt)}" width="650" height="650">${(p.images||[]).length>1?`<div class="detail-thumbnails">${p.images.map((src,index)=>`<button type="button" data-detail-photo="${escapeHtml(src)}" aria-label="${escapeHtml(t('photoNumber',{count:number(index+1)}))}"><img src="${src}" alt=""></button>`).join('')}</div>`:''}</div><div class="detail-copy"><p class="eyebrow">${t(p.id==='custom'?'madeForEvent':p.category)}</p><h2 id="product-title" dir="auto">${escapeHtml(text.name)}</h2><p class="detail-body" dir="auto">${escapeHtml(text.detail)}</p><p class="detail-price">${p.price===null?t('priceEnquiry'):priceHtml(p.price)+' / '+pack(p)}</p><p class="allergens"><strong>${t('ingredients')}</strong><br>${escapeHtml(text.allergens||t(p.allergens||(p.sample!==false?'allergensGeneral':'allergensCustom')))}</p><button class="button button-blue button-full" ${p.price===null?'data-open-custom':`data-detail-add="${p.id}"`}>${t(p.price===null?'plan':'add')}${icon(p.price===null?'arrow-up-right':'plus')}</button>${p.sample!==false?`<p class="inline-note">${t(p.price===null?'illustrativePhoto':'illustrativePrice')}</p>`:''}</div></div>`;
  hydrateIcons($('#product-detail'));if(shouldOpen)openDialog('#product-dialog');
}
function dateToday() { const now=new Date();return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`; }
function displayDate(value) { return new Intl.DateTimeFormat(locales[language],{year:'numeric',month:'long',day:'numeric'}).format(new Date(value+'T12:00:00')); }
const occasions=['treat','birthday','wedding','shower','eid','gift','other'];
let enquiryKind='order', enquiryDraft={}, preparedMessage='';
function showEnquiry(kind='order',editing=false,shouldOpen=true) {
  enquiryKind=kind;messageView='form';if(!editing)enquiryDraft={};
  const optional=`(${t('optional')})`;
  $('#message-title').textContent=t(kind==='custom'?'customTitle':'enquiryTitle');
  $('#message-content').innerHTML=`<p class="message-intro">${t(config.acceptingOrders?'enquiryOpen':'enquiryClosed')}</p><form id="enquiry-form"><div class="field"><label for="customer-name">${t('yourName')} <span>${optional}</span></label><input id="customer-name" name="name" autocomplete="given-name" maxlength="80" placeholder="${t('namePlaceholder')}" dir="auto"></div><div class="field-grid"><div class="field"><label for="requested-date">${t(kind==='custom'?'eventDate':'pickupDate')} ${optional}</label><input id="requested-date" type="date" name="date" min="${dateToday()}" max="2035-12-31"><small>${t('availability')}</small></div><div class="field"><label for="occasion">${t('occasion')} ${optional}</label><select id="occasion" name="occasion"><option value="">${t('chooseOccasion')}</option>${occasions.map(key=>`<option value="${key}">${t(key+'Occasion')}</option>`).join('')}</select></div></div>${kind==='custom'?`<div class="field"><label for="quantity-needed">${t('approximateQuantity')} ${optional}</label><input type="number" name="quantity" id="quantity-needed" min="1" max="10000" placeholder="${t('quantityPlaceholder')}"></div>`:''}<div class="field"><label for="customer-notes">${t(kind==='custom'?'customNotes':'orderNotes')} ${optional}</label><textarea id="customer-notes" name="notes" maxlength="1500" placeholder="${t(kind==='custom'?'customPlaceholder':'orderPlaceholder')}" dir="auto"></textarea><small>${t('allergyNote')}</small></div><button class="button button-blue button-full" type="submit">${t('prepare')}${icon('arrow-right')}</button><p class="inline-note">${t('localNote')}</p></form>`;
  for(const [key,value] of Object.entries(enquiryDraft)){const field=$(`[name="${key}"]`,$('#enquiry-form'));if(field)field.value=value;}
  hydrateIcons($('#message-content'));if(shouldOpen)openDialog('#message-dialog');
  $('#enquiry-form').addEventListener('submit',event=>{event.preventDefault();if(!event.currentTarget.reportValidity())return;prepareMessage(new FormData(event.currentTarget),kind);});
}
function prepareMessage(data,kind) {
  enquiryDraft=Object.fromEntries(data.entries());messageView='summary';
  const brand=language==='ar'?'\u2068'+config.name+'\u2069':config.name;
  const titleKey=config.acceptingOrders?(kind==='custom'?'messageCustom':'messageOrder'):(kind==='custom'?'messageSampleCustom':'messageSampleOrder');
  const lines=[t(titleKey,{brand}),''];
  if(data.get('name')?.trim())lines.push(t('messageName',{value:data.get('name').trim()}));
  if(kind==='order') {
    for(const [id,qty] of Object.entries(cart)) {
      const p=byId.get(id);lines.push(`${number(qty)} × ${productText(p).name} (${pack(p)}) : ${money(p.price*qty)}`);
    }
    lines.push(`${t(cartHasSample()?'subtotal':'estimatedSubtotal')}: ${money(cartTotal())}`);
  } else {
    lines.push(t('messageCustomBody'));
    if(data.get('quantity'))lines.push(t('messageQuantity',{value:number(Number(data.get('quantity')))}));
  }
  if(data.get('date'))lines.push(t('messageDate',{value:displayDate(data.get('date'))}));
  if(occasions.includes(data.get('occasion')))lines.push(t('messageOccasion',{value:t(data.get('occasion')+'Occasion')}));
  if(data.get('notes')?.trim())lines.push(t('messageNotes',{value:data.get('notes').trim()}));
  lines.push('',t('messageConfirm'));preparedMessage=lines.join('\n');
  const handle=config.instagramHandle.replace(/^@/,'');
  const canContact=config.acceptingOrders&&(handle||config.orderEmail);
  $('#message-title').textContent=t('readyTitle');
  $('#message-content').innerHTML=`<p class="message-intro">${t(canContact?'readyOpen':'readyClosed')}</p><pre class="message-summary" tabindex="0">${escapeHtml(preparedMessage)}</pre><div class="message-actions"><button class="button button-blue" data-copy-message>${t('copy')}${icon('copy')}</button><button class="button button-outline" data-download-message>${t('saveText')}</button>${canContact&&handle?`<a class="button button-outline" href="https://www.instagram.com/${encodeURIComponent(handle)}/" target="_blank" rel="noopener noreferrer">${t('openInstagram')}${icon('instagram-logo')}</a>`:''}${canContact&&config.orderEmail?`<a class="button button-outline" href="mailto:${encodeURIComponent(config.orderEmail)}?subject=${encodeURIComponent(t('messageSubject',{brand:config.name}))}&body=${encodeURIComponent(preparedMessage)}">${t('openEmail')}${icon('arrow-up-right')}</a>`:''}</div><p class="form-status" id="copy-status" role="status"></p><p class="inline-note">${t(config.acceptingOrders?'confirmationNote':'contactSoon')}</p><button class="text-link" data-edit-enquiry>${t('edit')}${icon('arrow-right')}</button>`;
  hydrateIcons($('#message-content'));
}
async function copyMessage() {
  try { await navigator.clipboard.writeText(preparedMessage);$('#copy-status').textContent=t('copied'); }
  catch { const text=$('.message-summary'),range=document.createRange();range.selectNodeContents(text);const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);$('#copy-status').textContent=t('copyFallback'); }
}
function downloadMessage() {
  const url=URL.createObjectURL(new Blob([preparedMessage],{type:'text/plain;charset=utf-8'}));
  const a=document.createElement('a');a.href=url;a.download=`TastesLikeHome-${language}-enquiry.txt`;a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);toast(t('saved'));
}
function showSocial(shouldOpen=true) {
  const handle=config.instagramHandle.replace(/^@/,'');
  if(handle){window.open(`https://www.instagram.com/${encodeURIComponent(handle)}/`,'_blank','noopener,noreferrer');return;}
  messageView='social';$('#message-title').textContent=t('socialTitle');
  $('#message-content').innerHTML=`<p class="message-intro">${t('socialBody')}</p><a class="button button-blue" href="#menu" data-social-menu>${t('menuLink')}</a>`;
  if(shouldOpen)openDialog('#message-dialog');
}
function setNavigation(open) {
  const button=$('.mobile-menu-button');button.setAttribute('aria-expanded',String(open));
  button.setAttribute('aria-label',t(open?'closeNav':'openNav'));$('#mobile-menu').hidden=!open;
  $('.icon',button).dataset.icon=open?'x':'list';hydrateIcons(button);
}
let storedTheme;try{storedTheme=localStorage.getItem('tasteslikehome-theme');}catch{}
if(storedTheme==='dark'||storedTheme==='light')document.documentElement.dataset.theme=storedTheme;
const isDark=()=>document.documentElement.dataset.theme?document.documentElement.dataset.theme==='dark':matchMedia('(prefers-color-scheme: dark)').matches;
function updateThemeButton() {
  const button=$('.theme-toggle');$('.icon',button).dataset.icon=isDark()?'sun':'moon';
  button.setAttribute('aria-label',t(isDark()?'lightTheme':'darkTheme'));hydrateIcons(button);
}
function applyLanguage(next,updateUrl=true) {
  if(!translations[next])return;
  const form=$('#enquiry-form');if(form&&$('#message-dialog').open)enquiryDraft=Object.fromEntries(new FormData(form).entries());
  language=next;document.documentElement.lang=next;document.documentElement.dir=next==='ar'?'rtl':'ltr';
  try{localStorage.setItem('tasteslikehome-language',next);}catch{}
  if(updateUrl){const url=new URL(location.href);url.searchParams.set('lang',next);history.replaceState(null,'',url);}
  $('#language-switcher').value=next;
  $$('[data-i18n]').forEach(el=>el.textContent=t(el.dataset.i18n));
  $$('[data-i18n-html]').forEach(el=>el.innerHTML=t(el.dataset.i18nHtml));
  for(const attribute of ['aria','alt','title']) {
    $$(`[data-i18n-${attribute}]`).forEach(el=>el.setAttribute(attribute==='aria'?'aria-label':attribute,t(el.getAttribute(`data-i18n-${attribute}`))));
  }
  document.title=t('metaTitle');
  $('meta[name="description"]').content=t('metaDescription');
  $('meta[property="og:title"]').content=t('metaTitle');
  $('meta[property="og:description"]').content=t('metaDescription');
  $('.toast').classList.remove('visible');$('.toast').textContent='';
  $$('.step-number').forEach((el,index)=>el.textContent=number(index+1));
  renderProducts();renderBag();renderKitchenPosts();applyShopSettings();updateThemeButton();
  setNavigation($('.mobile-menu-button').getAttribute('aria-expanded')==='true');
  if($('#product-dialog').open&&activeProduct)showProduct(activeProduct,false);
  if($('#message-dialog').open) {
    if(messageView==='form')showEnquiry(enquiryKind,true,false);
    else if(messageView==='summary') {
      const data=new FormData();for(const [key,value] of Object.entries(enquiryDraft))data.set(key,value);
      prepareMessage(data,enquiryKind);
    } else if(messageView==='social')showSocial(false);
    else if(messageView==='post'&&activePost)showKitchenPost(activePost,false);
  }
}
$('#language-switcher').addEventListener('change',event=>applyLanguage(event.target.value));
window.addEventListener('popstate',()=>{const requested=new URLSearchParams(location.search).get('lang');if(translations[requested])applyLanguage(requested,false);});
document.addEventListener('click',event=>{
  const photo=event.target.closest('[data-detail-photo]');if(photo)$('#detail-main-image').src=photo.dataset.detailPhoto;
  const post=event.target.closest('[data-post]');if(post)showKitchenPost(post.dataset.post);
  const close=event.target.closest('[data-close-dialog]');if(close)closeDialog(close.closest('dialog'));
  const filter=event.target.closest('[data-filter]');if(filter){$$('[data-filter]').forEach(btn=>{const active=btn===filter;btn.classList.toggle('active',active);btn.setAttribute('aria-pressed',active);});renderProducts(filter.dataset.filter);}
  const product=event.target.closest('[data-product]');if(product)showProduct(product.dataset.product);
  const add=event.target.closest('[data-add]');if(add)addToBag(add.dataset.add);
  const detailAdd=event.target.closest('[data-detail-add]');if(detailAdd){addToBag(detailAdd.dataset.detailAdd);closeDialog($('#product-dialog'));}
  if(event.target.closest('[data-open-bag]')){renderBag();openDialog('#bag-dialog');}
  const qty=event.target.closest('[data-quantity]');if(qty){const id=qty.dataset.quantity;cart[id]=Math.min(99,Math.max(0,(cart[id]||0)+Number(qty.dataset.change)));if(!cart[id])delete cart[id];persist();renderBag();const replacement=$(`[data-quantity="${id}"][data-change="${qty.dataset.change}"]`);if(replacement)replacement.focus();else $('[data-close-dialog]',$('#bag-dialog')).focus();}
  const remove=event.target.closest('[data-remove]');if(remove){delete cart[remove.dataset.remove];persist();renderBag();$('[data-close-dialog]',$('#bag-dialog')).focus();}
  if(event.target.closest('[data-continue-shopping]')){closeDialog($('#bag-dialog'));$('#menu').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});}
  if(event.target.closest('[data-order-enquiry]')&&cartCount())showEnquiry('order');
  if(event.target.closest('[data-open-custom]'))showEnquiry('custom');
  if(event.target.closest('[data-copy-message]'))copyMessage();
  if(event.target.closest('[data-download-message]'))downloadMessage();
  if(event.target.closest('[data-edit-enquiry]'))showEnquiry(enquiryKind,true);
  if(event.target.closest('[data-open-social]'))showSocial();
  if(event.target.closest('[data-social-menu]'))closeDialog($('#message-dialog'));
});
$('.mobile-menu-button').addEventListener('click',()=>setNavigation($('.mobile-menu-button').getAttribute('aria-expanded')!=='true'));
$$('#mobile-menu a').forEach(link=>link.addEventListener('click',()=>setNavigation(false)));
$('.theme-toggle').addEventListener('click',()=>{const theme=isDark()?'light':'dark';document.documentElement.dataset.theme=theme;try{localStorage.setItem('tasteslikehome-theme',theme);}catch{}updateThemeButton();});
matchMedia('(prefers-color-scheme: dark)').addEventListener('change',updateThemeButton);
$('#year').textContent=new Date().getFullYear();
hydrateIcons();applyLanguage(language,false);

function cartHasSample(){return Object.keys(cart).some(id=>byId.get(id)?.sample!==false);}
function localizedPost(post){
  const choices=[language,...['fr','en','ar'].filter(value=>value!==language)];
  return Object.fromEntries(['title','body','alt'].map(key=>[key,choices.map(lang=>post.translations[lang]?.[key]).find(Boolean)||'']));
}
function renderKitchenPosts(){
  const section=$('#kitchen-updates');if(!section)return;
  section.hidden=!kitchenPosts.length;
  $('#kitchen-posts').innerHTML=kitchenPosts.slice(0,6).map(post=>{
    const text=localizedPost(post);
    const date=post.publishedAt?new Intl.DateTimeFormat(locales[language],{dateStyle:'long'}).format(new Date(post.publishedAt)):'';
    const excerpt=text.body.length>160?text.body.slice(0,157)+'…':text.body;
    return `<article class="kitchen-post">${post.images[0]?`<button class="kitchen-post-image" data-post="${post.id}" aria-label="${escapeHtml(text.title)}"><img src="${post.images[0]}" alt="${escapeHtml(text.alt||text.title)}" loading="lazy" width="650" height="430"></button>`:''}<p class="kitchen-post-date">${escapeHtml(date)}</p><h3 dir="auto"><button data-post="${post.id}">${escapeHtml(text.title)}</button></h3><p dir="auto">${escapeHtml(excerpt)}</p><button class="text-link" data-post="${post.id}">${t('readPost')}${icon('arrow-right')}</button></article>`;
  }).join('');hydrateIcons(section);
}
function showKitchenPost(id,shouldOpen=true){
  const post=kitchenPosts.find(item=>item.id===id);if(!post)return;
  activePost=id;messageView='post';const text=localizedPost(post);
  $('#message-title').textContent=text.title;
  $('#message-content').innerHTML=`${post.images.map(src=>`<img class="post-full-image" src="${src}" alt="${escapeHtml(text.alt||text.title)}" loading="lazy">`).join('')}<p class="post-full-body" dir="auto">${escapeHtml(text.body)}</p>`;
  if(shouldOpen)openDialog('#message-dialog');
}
function applyShopSettings(){
  if(!shopSettings)return;
  const samples=products.some(product=>product.sample);
  $('.sample-label').textContent=t(samples?'sampleLabel':'realMenuLabel');
  $('.menu-disclaimer').hidden=!samples;
  const pickup=shopSettings.pickup?.[language]||['fr','en','ar'].map(lang=>shopSettings.pickup?.[lang]).find(Boolean);
  if(pickup)$('[data-i18n="faq2A"]').textContent=pickup;
  if(config.acceptingOrders)$('[data-i18n="orderStatus"]').textContent=t('ordersOpenStatus');
}
async function refreshContent(){
  try{
    const response=await fetch('/api/content',{cache:'no-store'});if(!response.ok)return;
    const data=await response.json();if(!Array.isArray(data.items)||!data.settings||data.revision===contentRevision)return;
    contentRevision=data.revision;shopSettings=data.settings;Object.assign(config,data.settings);
    products=data.items.filter(item=>item.type==='product');
    kitchenPosts=data.items.filter(item=>item.type==='post').sort((a,b)=>(b.publishedAt||'').localeCompare(a.publishedAt||''));
    byId.clear();products.forEach(item=>byId.set(item.id,item));
    renderProducts();renderBag();renderKitchenPosts();applyShopSettings();
  }catch{/* Keep the last loaded menu if connectivity is interrupted. */}
}
refreshContent();
window.addEventListener('focus',refreshContent);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshContent();});
setInterval(()=>{if(!document.hidden)refreshContent();},30000);
try{const updates=new BroadcastChannel('tasteslikehome-content');updates.addEventListener('message',refreshContent);}catch{}
