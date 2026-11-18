import {test} from 'node:test';
import assert from 'node:assert/strict';
import {handleApi,authorized,validateItem,validateSettings,imageType,MAX_IMAGE_BYTES} from '../server/cms.mjs';
const origin='https://bakery.example';
const password='test-only-password-not-a-real-secret';
function runtime(){
 let saved=null;const media=new Map();
 return {trustedIdentity:false,password,storage:{
  async load(){return saved?structuredClone(saved):null;},
  async save(document,version){if((saved?.version??null)!==version)return false;saved={document:structuredClone(document),version:document.revision};return true;},
  async putMedia(id,bytes,contentType){media.set(id,{body:bytes,contentType});},
  async getMedia(id){return media.get(id)||null;}
 }};
}
function request(path,{method='GET',body,cookie,headers={}}={}){
 return new Request(origin+path,{method,headers:{...(method!=='GET'?{origin}:{}),...(body&&typeof body!=='string'&&!(body instanceof Uint8Array)?{'content-type':'application/json'}:{}),...(cookie?{cookie}:{}),...headers},...(body?{body:body instanceof Uint8Array||typeof body==='string'?body:JSON.stringify(body)}:{})});
}
async function login(rt){const response=await handleApi(request('/api/admin/login',{method:'POST',body:{password}}),rt);assert.equal(response.status,200);return response.headers.get('set-cookie').split(';')[0];}
const product=(id='test-bake',status='draft',images=[])=>({id,type:'product',status,sample:false,category:'algerian',price:24,units:12,images,translations:{fr:{name:'Sablés maison',description:'Une nouvelle fournée.'},en:{name:'Homemade sablés'},ar:{name:'صابلي منزلي'}}});
async function update(rt,cookie,revision,extra){return handleApi(request('/api/admin/content',{method:'PUT',cookie,body:{revision,...extra}}),rt);}

test('anonymous reads expose only published content; unauthenticated writes are blocked',async()=>{
 const rt=runtime();const publicResponse=await handleApi(request('/api/content'),rt);const catalog=await publicResponse.json();assert.equal(catalog.items.length,6);assert(catalog.items.every(item=>item.status==='published'));
 assert.equal((await handleApi(request('/api/admin/content'),rt)).status,401);
 assert.equal((await update(rt,null,0,{action:'upsert',item:product()})).status,401);
 const forged=request('/api/admin/content',{headers:{'oai-authenticated-user-email':'owner@example.com','oai-authenticated-user-id':'forged'}});
 assert.equal((await handleApi(forged,rt)).status,401);
});
test('login uses an HttpOnly, SameSite, Secure session; invalid or rotated credentials fail',async()=>{
 const rt=runtime();const response=await handleApi(request('/api/admin/login',{method:'POST',body:{password}}),rt);const cookie=response.headers.get('set-cookie');assert.match(cookie,/HttpOnly/);assert.match(cookie,/SameSite=Strict/);assert.match(cookie,/Secure/);
 assert(await authorized(request('/api/admin/content',{cookie}),rt));
 assert.equal(await authorized(request('/api/admin/content',{cookie:cookie.replace('thl_admin=','thl_admin=x')}),rt),false);
 rt.password='another-test-only-password-secret';assert.equal(await authorized(request('/api/admin/content',{cookie}),rt),false);
 assert.equal((await handleApi(request('/api/admin/login',{method:'POST',body:{password:'incorrect'}}),rt)).status,401);
});
test('all state changes reject missing or cross-origin requests, including login',async()=>{
 const rt=runtime();const cookie=await login(rt);
 const cross=request('/api/admin/content',{method:'PUT',cookie,body:{revision:0,action:'upsert',item:product()},headers:{origin:'https://unrelated.example'}});
 assert.equal((await handleApi(cross,rt)).status,403);
 const loginRequest=new Request(origin+'/api/admin/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({password})});
 assert.equal((await handleApi(loginRequest,rt)).status,403);
});
test('draft, publish, archive, and restoration change the shared storefront correctly',async()=>{
 const rt=runtime(),cookie=await login(rt);
 let response=await update(rt,cookie,0,{action:'upsert',item:product()});assert.equal(response.status,200);let current=await response.json();assert.equal(current.revision,1);
 let publicData=await (await handleApi(request('/api/content'),rt)).json();assert.equal(publicData.items.some(item=>item.id==='test-bake'),false);
 response=await update(rt,cookie,1,{action:'upsert',item:product('test-bake','published',['/assets/flowers.webp'])});assert.equal(response.status,200);current=await response.json();assert.equal(current.items.find(item=>item.id==='test-bake').publishedAt.length,24);
 publicData=await (await handleApi(request('/api/content'),rt)).json();assert(publicData.items.some(item=>item.id==='test-bake'));
 response=await update(rt,cookie,2,{action:'status',id:'test-bake',status:'archived'});assert.equal(response.status,200);
 publicData=await (await handleApi(request('/api/content'),rt)).json();assert(!publicData.items.some(item=>item.id==='test-bake'));
 response=await update(rt,cookie,3,{action:'status',id:'test-bake',status:'draft'});assert.equal(response.status,200);
 current=await response.json();assert.equal(current.items.find(item=>item.id==='test-bake').status,'draft');
});
test('stale revisions never overwrite another tab’s changes',async()=>{
 const rt=runtime(),cookie=await login(rt);
 assert.equal((await update(rt,cookie,0,{action:'upsert',item:product()})).status,200);
 const stale=await update(rt,cookie,0,{action:'upsert',item:product('second-bake')});assert.equal(stale.status,409);assert.equal((await stale.json()).error,'content_changed');
 const current=await (await handleApi(request('/api/admin/content',{cookie}),rt)).json();assert(!current.items.some(item=>item.id==='second-bake'));
});
test('uploaded images stay private until attached to published content',async()=>{
 const rt=runtime(),cookie=await login(rt);const bytes=new Uint8Array([137,80,78,71,13,10,26,10,0]);
 const upload=await handleApi(request('/api/admin/upload',{method:'POST',cookie,body:bytes,headers:{'content-type':'image/png'}}),rt);assert.equal(upload.status,201);const {url}=await upload.json();
 assert.equal((await handleApi(request(url),rt)).status,404);assert.equal((await handleApi(request(url,{cookie}),rt)).status,200);
 assert.equal((await update(rt,cookie,0,{action:'upsert',item:product('photo-bake','published',[url])})).status,200);
 const published=await handleApi(request(url),rt);assert.equal(published.status,200);assert.equal(published.headers.get('content-type'),'image/png');assert.deepEqual(new Uint8Array(await published.arrayBuffer()),bytes);
});
test('schema validation rejects unsafe media, invalid prices, and incomplete published content',()=>{
 assert.throws(()=>validateItem(product('test','published')),/photo_required/);
 assert.throws(()=>validateItem({...product(),images:['https://unrelated.example/photo.svg']}),/invalid_image/);
 assert.throws(()=>validateItem({...product(),price:-1}),/invalid_price/);
 assert.throws(()=>validateItem({...product(),units:1.2}),/invalid_quantity/);
 assert.throws(()=>validateItem({id:'story',type:'post',status:'published',images:[],translations:{en:{title:'A new batch'}}}),/body_required/);
 assert.equal(imageType(new TextEncoder().encode('<svg onload="alert(1)"></svg>')),null);
 assert.throws(()=>validateSettings({currency:'CAD',acceptingOrders:true}),/contact_required/);
});
test('image uploads enforce file signatures and size limits',async()=>{
 const rt=runtime(),cookie=await login(rt);
 const invalid=await handleApi(request('/api/admin/upload',{method:'POST',cookie,body:'<svg></svg>',headers:{'content-type':'image/png'}}),rt);assert.equal(invalid.status,415);
 const tooLarge=await handleApi(request('/api/admin/upload',{method:'POST',cookie,body:new Uint8Array(MAX_IMAGE_BYTES+1),headers:{'content-type':'image/png','content-length':String(MAX_IMAGE_BYTES+1)}}),rt);assert.equal(tooLarge.status,413);
});
test('published posts become visible without a code deployment, and samples can be hidden',async()=>{
 const rt=runtime(),cookie=await login(rt);
 const post={id:'kitchen-story',type:'post',status:'published',sample:false,images:[],translations:{en:{title:'A new batch',body:'Made this morning.'}}};
 assert.equal((await update(rt,cookie,0,{action:'upsert',item:post})).status,200);
 const settings={currency:'CAD',instagramHandle:'tasteslikehome',orderEmail:'',acceptingOrders:true,showSamples:false,pickup:{fr:'Retrait sur rendez-vous.',en:'Pickup by appointment.',ar:''}};
 assert.equal((await update(rt,cookie,1,{action:'settings',settings})).status,200);
 const current=await (await handleApi(request('/api/content'),rt)).json();assert.equal(current.items.length,1);assert.equal(current.items[0].type,'post');assert.equal(current.settings.showSamples,false);
});
