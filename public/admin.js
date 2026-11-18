'use strict';
const $=(selector,parent=document)=>parent.querySelector(selector);
const $$=(selector,parent=document)=>[...parent.querySelectorAll(selector)];
const dictionaries=window.ADMIN_TRANSLATIONS;
let lang=dictionaries[document.documentElement.lang]?document.documentElement.lang:'en';
const locales={fr:'fr-CA',en:'en-CA',ar:'ar-DZ-u-nu-arab'};
const languages=['fr','en','ar'];
const languageNames={fr:'Français',en:'English',ar:'العربية'};
let catalog=null,session=null,view='products',listStatus='all',editing=null,contentLanguage=lang,busy=false,uploading=false,conflicted=false;
const t=key=>key.split('.').reduce((object,part)=>object?.[part],dictionaries[lang])||key;
const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const icon=name=>`<i class="icon" data-icon="${name}" aria-hidden="true"></i>`;
const number=value=>new Intl.NumberFormat(locales[lang]).format(value);
const money=value=>new Intl.NumberFormat(locales[lang],{style:'currency',currency:catalog?.settings.currency||'CAD',currencyDisplay:'code',maximumFractionDigits:2}).format(value);
function icons(parent=document){$$('[data-icon]',parent).forEach(el=>el.style.setProperty('--icon',`url("/assets/icons/${el.dataset.icon}.svg")`));}
function messageFor(error){return dictionaries[lang].errors[error?.code]||t('errors.network');}
async function api(path,options={}) {
 let response;
 try{response=await fetch('/api/admin/'+path,{...options,headers:{...(options.body&&typeof options.body==='string'?{'Content-Type':'application/json'}:{}),...options.headers},cache:'no-store'});}catch{throw {code:'network'};}
 let data;try{data=await response.json();}catch{throw {code:'network'};}
 if(!response.ok)throw {code:data.error||'network',status:response.status};
 return data;
}
let toastTimeout;
function toast(message){const el=$('#admin-toast');el.textContent=message;el.classList.add('visible');clearTimeout(toastTimeout);toastTimeout=setTimeout(()=>el.classList.remove('visible'),3500);}
function itemText(item,key){return item.translations?.[lang]?.[key]||languages.map(language=>item.translations?.[language]?.[key]).find(Boolean)||'';}
function broadcast(){try{const channel=new BroadcastChannel('tasteslikehome-content');channel.postMessage({updated:true});channel.close();}catch{}}
function setBusy(value){busy=value;$$('#editor-form button, #editor-form input, #editor-form textarea, #editor-form select').forEach(el=>el.disabled=value);$('#save-draft').disabled=value||conflicted;$('#publish-item').disabled=value||conflicted;$('#item-price').disabled=value||$('#item-enquiry').checked;}
function translate(){
 document.documentElement.lang=lang;document.documentElement.dir=lang==='ar'?'rtl':'ltr';
 try{localStorage.setItem('tasteslikehome-language',lang);}catch{}
 $('#chatgpt-login').href='/signin-with-chatgpt?return_to='+encodeURIComponent('/admin?lang='+lang);
 $('#admin-language').value=lang;
 $$('[data-admin-i18n]').forEach(el=>el.textContent=t(el.dataset.adminI18n));
 $('#admin-search').placeholder=t('searchPlaceholder');
 $('[data-close-editor]').setAttribute('aria-label',t('closeEditor'));
 document.title='TastesLikeHome | '+t('studio');
 $('.admin-tabs').setAttribute('aria-label',t('studio'));
 $('.admin-content-languages').setAttribute('aria-label',t('language'));
 $('#status-filters').setAttribute('aria-label',t('all'));
 $('#admin-toast').classList.remove('visible');$('#admin-toast').textContent='';
 icons();
}
async function loadCatalog(){
 $('#admin-loading').hidden=false;$('#admin-error').textContent='';
 try{catalog=await api('content');render();}
 catch(error){$('#admin-error').textContent=messageFor(error);}
 finally{$('#admin-loading').hidden=true;}
}
async function boot(){
 translate();$('#admin-login').hidden=true;$('#admin-content').hidden=true;
 try{
  session=await api('session');
  if(!session.authenticated||!session.storageReady){showLogin();return;}
  $('#admin-content').hidden=false;$('#admin-logout').hidden=false;await loadCatalog();
 }catch(error){$('#admin-login').hidden=false;$('#login-explanation').textContent=t('errors.network');$('#login-error').textContent=messageFor(error);}
}
function showLogin(){
 $('#admin-login').hidden=false;$('#admin-content').hidden=true;
 const ready=session?.configured&&session?.storageReady;
 $('#login-explanation').textContent=!session?.configured?t('setupExplanation'):!session?.storageReady?t('storageExplanation'):t(session.authMode==='chatgpt'?'chatgptExplanation':'passwordExplanation');
 $('#chatgpt-login').hidden=!(ready&&session.authMode==='chatgpt');$('#password-login').hidden=!(ready&&session.authMode==='password');
}
function render(){
 if(!catalog)return;
 $('#product-count').textContent=number(catalog.items.filter(item=>item.type==='product'&&item.status!=='archived').length);
 $('#post-count').textContent=number(catalog.items.filter(item=>item.type==='post'&&item.status!=='archived').length);
 $$('.admin-tab').forEach(button=>{const selected=button.dataset.view===view;button.classList.toggle('active',selected);button.setAttribute('aria-current',selected?'page':'false');});
 $('#admin-title').textContent=t(view+'Title');$('#admin-subtitle').textContent=t(view+'Subtitle');
 $('#new-item').hidden=view==='settings';$('#new-item-label').textContent=t(view==='posts'?'addPost':'addProduct');
 $('#catalog-view').hidden=view==='settings';$('#shop-settings').hidden=view!=='settings';
 if(view==='settings'){renderSettings();return;}
 renderList();
}
function renderList(){
 const query=$('#admin-search').value.trim().toLocaleLowerCase(locales[lang]);
 const type=view==='posts'?'post':'product';
 const list=catalog.items.filter(item=>item.type===type&&(listStatus==='all'?item.status!=='archived':item.status===listStatus)&&(!query||languages.some(language=>Object.values(item.translations?.[language]||{}).some(value=>typeof value==='string'&&value.toLocaleLowerCase(locales[lang]).includes(query)))));
 $$('[data-list-status]').forEach(button=>{const active=button.dataset.listStatus===listStatus;button.classList.toggle('active',active);button.setAttribute('aria-pressed',active);});
 const sample=catalog.items.some(item=>item.type===type&&item.sample&&item.status!=='archived');
 $('#sample-help').hidden=!sample;$('#sample-help').textContent=t('sampleHelp');
 $('#admin-items').innerHTML=list.length?list.map(item=>{
  const title=itemText(item,type==='post'?'title':'name');
  const meta=item.type==='product'?`${t(item.category)} · ${item.price===null?t('noPrice'):money(item.price)}`:item.publishedAt?new Intl.DateTimeFormat(locales[lang],{dateStyle:'medium'}).format(new Date(item.publishedAt)):t('draft');
  return `<article class="admin-item">${item.images[0]?`<img class="admin-item-image" src="${item.images[0]}" alt="${escapeHtml(itemText(item,'alt')||title)}" width="76" height="82">`:`<div class="admin-item-image admin-item-placeholder">${icon(type==='post'?'heart':'cookie')}</div>`}<div><button class="admin-item-title" data-edit="${item.id}" dir="auto">${escapeHtml(title)}</button><div class="admin-item-meta"><span class="admin-status admin-status-${item.status}">${t(item.status==='draft'?'draftLabel':item.status)}</span>${item.sample?`<span>${t('sample')}</span>`:''}<span>${escapeHtml(meta)}</span></div></div><div class="admin-item-actions"><button data-edit="${item.id}">${t('edit')}</button><button data-item-status="${item.id}" data-status="${item.status==='archived'?'draft':'archived'}">${t(item.status==='archived'?'restore':'archive')}</button></div></article>`;
 }).join(''):`<div class="admin-empty">${icon(type==='post'?'heart':'cookie')}<h2>${t('emptyTitle')}</h2><p>${t(query||listStatus!=='all'?'emptyFilter':type==='post'?'emptyPosts':'emptyProducts')}</p>${!query&&listStatus==='all'?`<button class="button button-blue" data-new-item>${t(type==='post'?'addPost':'addProduct')}${icon('plus')}</button>`:''}</div>`;
 icons($('#admin-items'));
}
function renderSettings(){
 const settings=catalog.settings;
 $('#shop-instagram').value=settings.instagramHandle;$('#shop-email').value=settings.orderEmail;$('#shop-currency').value=settings.currency;
 $('#shop-orders').checked=settings.acceptingOrders;$('#shop-samples').checked=settings.showSamples;
 $('#pickup-fields').innerHTML=languages.map(language=>`<div class="field"><label for="pickup-${language}" lang="${language}">${languageNames[language]}</label><textarea id="pickup-${language}" name="pickup-${language}" lang="${language}" dir="${language==='ar'?'rtl':'ltr'}" maxlength="2000">${escapeHtml(settings.pickup[language])}</textarea></div>`).join('');
}
function captureLocale(){
 if(!editing)return;
 $$('[data-localized-field]',$('#localized-fields')).forEach(field=>editing.translations[contentLanguage][field.dataset.localizedField]=field.value);
}
function renderLocaleFields(){
 const entry=editing.translations[contentLanguage];
 const fields=editing.type==='product'?[['name','input',140],['description','textarea',400],['detail','textarea',4000],['allergens','textarea',2000],['alt','input',300]]:[['title','input',140],['body','textarea',12000],['alt','input',300]];
 const labels={name:'name',description:'description',detail:'details',allergens:'allergens',alt:'alt',title:'postTitle',body:'body'};
 $('#localized-fields').innerHTML=fields.map(([key,tag,max])=>`<div class="field"><label for="localized-${key}">${t(labels[key])}</label>${tag==='input'?`<input id="localized-${key}" data-localized-field="${key}" name="${key}" maxlength="${max}" lang="${contentLanguage}" dir="${contentLanguage==='ar'?'rtl':'ltr'}" value="${escapeHtml(entry[key]||'')}">`:`<textarea id="localized-${key}" data-localized-field="${key}" name="${key}" maxlength="${max}" lang="${contentLanguage}" dir="${contentLanguage==='ar'?'rtl':'ltr'}">${escapeHtml(entry[key]||'')}</textarea>`}${key==='alt'?`<small>${t('altHelp')}</small>`:''}</div>`).join('');
 $$('[data-content-language]').forEach(button=>{const active=button.dataset.contentLanguage===contentLanguage;button.classList.toggle('active',active);button.setAttribute('aria-pressed',active);});
}
function renderPhotos(){
 $('#editor-photos').innerHTML=editing.images.map((url,index)=>`<div class="admin-photo"><img src="${url}" alt="${escapeHtml(itemText(editing,'alt')||t('photos'))}"><div class="admin-photo-actions">${index===0?`<strong>${t('cover')}</strong>`:`<button type="button" data-photo-cover="${index}">${t('makeCover')}</button>`}<button type="button" data-photo-remove="${index}">${t('remove')}</button></div></div>`).join('');
 $('.admin-upload').hidden=editing.images.length>=6;
}
function openEditor(id){
 const previous=id?catalog.items.find(item=>item.id===id):null;
 editing=previous?structuredClone(previous):{id:'item_'+crypto.randomUUID(),type:view==='posts'?'post':'product',status:'draft',sample:false,category:'algerian',price:null,units:12,images:[],translations:Object.fromEntries(languages.map(language=>[language,{}]))};
 contentLanguage=lang;conflicted=false;
 for(const language of languages)editing.translations[language]||={};
 $('#editor-category').textContent=t(editing.type==='product'?'products':'posts');
 $('#editor-title').textContent=t(previous?(editing.type==='product'?'editProduct':'editPost'):(editing.type==='product'?'newProduct':'newPost'));
 $('#editor-error').textContent='';$('#upload-status').textContent='';$('#editor-state').textContent=t(editing.status==='published'?'publishedState':editing.status==='archived'?'archivedState':'draftState');
 $('#product-options').hidden=editing.type!=='product';
 $('label[for="item-price"]').textContent=t('price')+' ('+catalog.settings.currency+')';
 $('#item-category').value=editing.category;$('#item-price').value=editing.price??'';$('#item-units').value=editing.units??'';
 $('#item-enquiry').checked=previous?editing.price===null:false;$('#item-sample').checked=editing.sample;
 $('#item-sample').closest('label').hidden=editing.type!=='product';
 $('#publish-item').textContent=t(editing.status==='published'?'updateWebsite':'publish');
 renderPhotos();renderLocaleFields();setBusy(false);
 $('#editor').showModal();document.body.classList.add('modal-open');
}
function closeEditor(){if(busy||uploading)return;$('#editor').close();document.body.classList.remove('modal-open');editing=null;if(conflicted)loadCatalog();conflicted=false;}
function collectItem(status){
 captureLocale();
 const item=structuredClone(editing);item.status=status;item.sample=item.type==='product'&&$('#item-sample').checked;
 if(item.type==='product'){
  item.category=$('#item-category').value;
  if(!$('#item-enquiry').checked&&$('#item-price').value==='')throw {code:'invalid_price'};
  item.price=$('#item-enquiry').checked?null:Number($('#item-price').value);
  item.units=$('#item-units').value===''?null:Number($('#item-units').value);
 }
 return item;
}
async function saveItem(status){
 if(busy||uploading||conflicted)return;
 $('#editor-error').textContent='';
 try{
  const item=collectItem(status);setBusy(true);
  catalog=await api('content',{method:'PUT',body:JSON.stringify({revision:catalog.revision,action:'upsert',item})});
  setBusy(false);closeEditor();render();broadcast();toast(t(status==='published'?'savedPublished':'savedDraft'));
 }catch(error){if(error.code==='content_changed')conflicted=true;$('#editor-error').textContent=messageFor(error);$('#editor-error').focus();setBusy(false);}
}
async function changeStatus(id,status){
 if(busy)return;busy=true;$('#admin-error').textContent='';
 try{catalog=await api('content',{method:'PUT',body:JSON.stringify({revision:catalog.revision,action:'status',id,status})});render();broadcast();toast(t(status==='archived'?'savedArchived':'savedRestored'));}
 catch(error){$('#admin-error').textContent=messageFor(error);if(error.code==='content_changed')await loadCatalog();}
 finally{busy=false;}
}
async function prepareImage(file){
 if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw {code:'unsupported_image'};
 if(file.size>25*1024*1024)throw {code:'image_too_large'};
 const url=URL.createObjectURL(file);
 try{
  const image=new Image();image.src=url;await image.decode();
  const scale=Math.min(1,2000/Math.max(image.naturalWidth,image.naturalHeight));
  const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
  canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',.86));
  if(!blob||blob.size>4*1024*1024)throw {code:'image_too_large'};
  return blob;
 }catch(error){if(error?.code)throw error;throw {code:'unsupported_image'};}
 finally{URL.revokeObjectURL(url);}
}
async function uploadPhotos(files){
 if(busy||uploading||!editing)return;
 if(editing.images.length+files.length>6){$('#upload-status').textContent=t('photoLimit');return;}
 uploading=true;setBusy(true);$('#upload-status').textContent=t('uploading');
 try{
  for(const file of files){const blob=await prepareImage(file);const data=await api('upload',{method:'POST',headers:{'Content-Type':blob.type},body:blob});editing.images.push(data.url);renderPhotos();}
  $('#upload-status').textContent=t('uploaded');
 }catch(error){$('#upload-status').textContent=messageFor(error);}
 finally{uploading=false;setBusy(false);$('#photo-upload').value='';}
}
$('#editor-form').addEventListener('submit',event=>event.preventDefault());
$('#editor').addEventListener('cancel',event=>{if(busy||uploading)event.preventDefault();});
$('#editor').addEventListener('close',()=>{document.body.classList.remove('modal-open');editing=null;if(conflicted)loadCatalog();conflicted=false;});
$('#photo-upload').addEventListener('change',event=>uploadPhotos([...event.target.files]));
$('#item-enquiry').addEventListener('change',()=>$('#item-price').disabled=$('#item-enquiry').checked);
$('#save-draft').addEventListener('click',()=>saveItem('draft'));$('#publish-item').addEventListener('click',()=>saveItem('published'));
$('#new-item').addEventListener('click',()=>openEditor());
$('#admin-search').addEventListener('input',renderList);
document.addEventListener('click',event=>{
 const tab=event.target.closest('[data-view]');if(tab&&!busy){view=tab.dataset.view;listStatus='all';$('#admin-search').value='';render();}
 const filter=event.target.closest('[data-list-status]');if(filter){listStatus=filter.dataset.listStatus;renderList();}
 const edit=event.target.closest('[data-edit]');if(edit&&!busy)openEditor(edit.dataset.edit);
 if(event.target.closest('[data-new-item]')&&!busy)openEditor();
 const status=event.target.closest('[data-item-status]');if(status)changeStatus(status.dataset.itemStatus,status.dataset.status);
 if(event.target.closest('[data-close-editor]'))closeEditor();
 const content=event.target.closest('[data-content-language]');if(content&&!busy){captureLocale();contentLanguage=content.dataset.contentLanguage;renderLocaleFields();}
 const remove=event.target.closest('[data-photo-remove]');if(remove&&!busy){editing.images.splice(Number(remove.dataset.photoRemove),1);renderPhotos();}
 const cover=event.target.closest('[data-photo-cover]');if(cover&&!busy){const [photo]=editing.images.splice(Number(cover.dataset.photoCover),1);editing.images.unshift(photo);renderPhotos();}
});
$('#admin-language').addEventListener('change',event=>{
 lang=event.target.value;try{localStorage.setItem('tasteslikehome-language',lang);}catch{}
 const url=new URL(location.href);url.searchParams.set('lang',lang);history.replaceState(null,'',url);translate();if(catalog)render();else if(session)showLogin();
});
$('#password-login').addEventListener('submit',async event=>{
 event.preventDefault();$('#login-error').textContent='';const button=$('button',event.currentTarget);button.disabled=true;
 try{await api('login',{method:'POST',body:JSON.stringify({password:$('#admin-password').value})});$('#admin-password').value='';await boot();}
 catch(error){$('#login-error').textContent=messageFor(error);}finally{button.disabled=false;}
});
$('#admin-logout').addEventListener('click',async()=>{
 if(session?.authMode==='chatgpt'){location.href='/signout-with-chatgpt?return_to='+encodeURIComponent('/admin?lang='+lang);return;}
 try{await api('logout',{method:'POST'});catalog=null;$('#admin-logout').hidden=true;await boot();}catch(error){toast(messageFor(error));}
});
$('#shop-settings').addEventListener('submit',async event=>{
 event.preventDefault();if(busy)return;busy=true;const button=$('[type=submit]',event.currentTarget);button.disabled=true;$('#settings-error').textContent='';$('#settings-status').textContent='';
 const settings={instagramHandle:$('#shop-instagram').value,orderEmail:$('#shop-email').value,currency:$('#shop-currency').value,acceptingOrders:$('#shop-orders').checked,showSamples:$('#shop-samples').checked,pickup:Object.fromEntries(languages.map(language=>[language,$('#pickup-'+language).value]))};
 try{catalog=await api('content',{method:'PUT',body:JSON.stringify({revision:catalog.revision,action:'settings',settings})});broadcast();$('#settings-status').textContent=t('settingsSaved');toast(t('settingsSaved'));}
 catch(error){$('#settings-error').textContent=messageFor(error);}finally{busy=false;button.disabled=false;}
});
boot();
