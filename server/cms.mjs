import seed from './seed.json' with {type:'json'};
export const MAX_IMAGE_BYTES=4*1024*1024;
const LANGUAGES=['fr','en','ar'];
const STATUSES=['draft','published','archived'];
const json=(body,status=200,extra={})=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff',...extra}});
const failure=(code,status=400)=>json({error:code},status);
const freshSeed=()=>structuredClone(seed);
const text=(value,max)=>typeof value==='string'?value.trim().slice(0,max):'';
const validImage=path=>typeof path==='string'&&(/^\/assets\/[a-zA-Z0-9_-]+\.(webp|jpg|jpeg|png|avif)$/.test(path)||/^\/api\/media\/[a-f0-9-]{36}$/.test(path));
export function validateItem(input,previous) {
  if(!input||typeof input!=='object')throw new Error('invalid_item');
  const id=text(input.id,64);
  if(!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(id))throw new Error('invalid_item');
  if(!['product','post'].includes(input.type)||!STATUSES.includes(input.status))throw new Error('invalid_item');
  if(previous&&previous.type!==input.type)throw new Error('invalid_item');
  const translations={};
  for(const language of LANGUAGES) {
    const entry=input.translations?.[language]||{};
    translations[language]={name:text(entry.name,140),description:text(entry.description,400),detail:text(entry.detail,4000),allergens:text(entry.allergens,2000),alt:text(entry.alt,300),title:text(entry.title,140),body:text(entry.body,12000)};
  }
  const isProduct=input.type==='product';
  if(!LANGUAGES.some(language=>translations[language][isProduct?'name':'title']))throw new Error('title_required');
  if(!Array.isArray(input.images)||input.images.length>6||!input.images.every(validImage))throw new Error('invalid_image');
  if(input.status==='published'&&isProduct&&!input.images.length)throw new Error('photo_required');
  if(input.status==='published'&&!isProduct&&!LANGUAGES.some(language=>translations[language].title&&translations[language].body))throw new Error('body_required');
  let price=null,units=null,category='events';
  if(isProduct) {
    if(!['algerian','american','events'].includes(input.category))throw new Error('category_required');
    category=input.category;
    if(input.price!==null&&input.price!=='') {
      if(typeof input.price!=='number'||!Number.isFinite(input.price)||input.price<0||input.price>100000)throw new Error('invalid_price');
      price=Math.round(input.price*100)/100;
    }
    if(input.units!==null&&input.units!=='') {
      if(!Number.isInteger(input.units)||input.units<1||input.units>10000)throw new Error('invalid_quantity');
      units=input.units;
    }
  }
  const now=new Date().toISOString();
  return {id,type:input.type,status:input.status,sample:input.sample===true,category,price,units,images:[...new Set(input.images)],translations,createdAt:previous?.createdAt||now,updatedAt:now,publishedAt:previous?.publishedAt||(input.status==='published'?now:null)};
}
export function validateSettings(input) {
  const instagramHandle=text(input?.instagramHandle,30).replace(/^@/,'');
  const orderEmail=text(input?.orderEmail,254);
  if(instagramHandle&&!/^[a-zA-Z0-9_.]{1,30}$/.test(instagramHandle))throw new Error('invalid_instagram');
  if(orderEmail&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(orderEmail))throw new Error('invalid_email');
  const currency=text(input?.currency,3).toUpperCase();
  if(!/^[A-Z]{3}$/.test(currency))throw new Error('invalid_currency');
  if(input?.acceptingOrders===true&&!instagramHandle&&!orderEmail)throw new Error('contact_required');
  return {instagramHandle,orderEmail,currency,acceptingOrders:input?.acceptingOrders===true,showSamples:input?.showSamples!==false,pickup:Object.fromEntries(LANGUAGES.map(language=>[language,text(input?.pickup?.[language],2000)]))};
}
export function imageType(bytes) {
  if(bytes.length>=12&&bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff)return 'image/jpeg';
  if(bytes.length>=8&&[137,80,78,71,13,10,26,10].every((value,index)=>bytes[index]===value))return 'image/png';
  if(bytes.length>=12&&String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP')return 'image/webp';
  return null;
}
const encoder=new TextEncoder();
const base64url=bytes=>btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const decode64=value=>Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')),char=>char.charCodeAt(0));
const keyFor=secret=>crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);
async function sessionToken(secret) {
  const payload=base64url(encoder.encode(JSON.stringify({scope:'admin',exp:Date.now()+12*60*60*1000,nonce:crypto.randomUUID()})));
  const signature=await crypto.subtle.sign('HMAC',await keyFor(secret),encoder.encode(payload));
  return payload+'.'+base64url(new Uint8Array(signature));
}
export async function authorized(request,runtime) {
  if(runtime.trustedIdentity&&runtime.adminEmail&&request.headers.get('oai-authenticated-user-id')&&request.headers.get('oai-authenticated-user-email')?.toLowerCase()===runtime.adminEmail.toLowerCase())return true;
  if(!runtime.password||runtime.password.length<16)return false;
  const value=request.headers.get('cookie')?.split(';').map(part=>part.trim()).find(part=>part.startsWith('thl_admin='))?.slice(10);
  if(!value)return false;
  try {
    const [payload,signature,extra]=value.split('.');if(extra||!payload||!signature)return false;
    if(!await crypto.subtle.verify('HMAC',await keyFor(runtime.password),decode64(signature),encoder.encode(payload)))return false;
    const data=JSON.parse(new TextDecoder().decode(decode64(payload)));
    return data.scope==='admin'&&typeof data.exp==='number'&&data.exp>Date.now();
  } catch {return false;}
}
async function equalPassword(left,right) {
  const a=new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(left)));
  const b=new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(right)));
  let difference=0;for(let i=0;i<a.length;i++)difference|=a[i]^b[i];return difference===0;
}
function cookie(request,value,expires=false) {
  const secure=new URL(request.url).protocol==='https:'?'; Secure':'';
  return `thl_admin=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${expires?0:43200}${secure}`;
}
async function readBytes(request,maximum,code) {
  const reader=request.body?.getReader();if(!reader)return new Uint8Array();
  const chunks=[];let total=0;
  while(true){const {done,value}=await reader.read();if(done)break;total+=value.length;if(total>maximum){await reader.cancel();throw new Error(code);}chunks.push(value);}
  const result=new Uint8Array(total);let offset=0;for(const chunk of chunks){result.set(chunk,offset);offset+=chunk.length;}return result;
}
async function readJson(request,maximum=128*1024) {
  if(!request.headers.get('content-type')?.includes('application/json'))throw new Error('invalid_request');
  const body=new TextDecoder().decode(await readBytes(request,maximum,'request_too_large'));
  try{return JSON.parse(body);}catch{throw new Error('invalid_request');}
}
async function load(runtime) {
  const current=await runtime.storage.load();return current?current:{document:freshSeed(),version:null};
}
export function publicDocument(document) {
  return {revision:document.revision,settings:document.settings,items:document.items.filter(item=>item.status==='published'&&(!item.sample||document.settings.showSamples))};
}
export async function handleApi(request,runtime) {
  const path=new URL(request.url).pathname.replace(/\/+$/,'');
  const write=!['GET','HEAD'].includes(request.method);
  if(write&&request.headers.get('origin')!==new URL(request.url).origin)return failure('origin_rejected',403);
  try {
    if(path==='/api/admin/session'&&request.method==='GET')return json({authenticated:await authorized(request,runtime),authMode:runtime.trustedIdentity?'chatgpt':'password',configured:runtime.trustedIdentity?Boolean(runtime.adminEmail):Boolean(runtime.password?.length>=16),storageReady:Boolean(runtime.storage)});
    if(path==='/api/admin/login'&&request.method==='POST') {
      if(runtime.trustedIdentity)return failure('use_chatgpt_signin',400);
      if(!runtime.password||runtime.password.length<16)return failure('admin_not_configured',503);
      const input=await readJson(request,4096);
      if(typeof input.password!=='string'||!await equalPassword(input.password,runtime.password))return failure('invalid_password',401);
      return json({authenticated:true},200,{'Set-Cookie':cookie(request,await sessionToken(runtime.password))});
    }
    if(path==='/api/admin/logout'&&request.method==='POST')return json({ok:true},200,{'Set-Cookie':cookie(request,'',true)});
    if(!runtime.storage)return failure('storage_unavailable',503);
    if(path==='/api/content'&&request.method==='GET')return json(publicDocument((await load(runtime)).document));
    const media=path.match(/^\/api\/media\/([a-f0-9-]{36})$/);
    if(media&&request.method==='GET') {
      const {document}=await load(runtime);
      const published=publicDocument(document).items.some(item=>item.images.includes(path));
      if(!published&&!await authorized(request,runtime))return failure('not_found',404);
      const file=await runtime.storage.getMedia(media[1]);if(!file)return failure('not_found',404);
      return new Response(file.body,{headers:{'Content-Type':file.contentType,'X-Content-Type-Options':'nosniff','Cache-Control':published?'public, max-age=300':'private, no-store'}});
    }
    if(!path.startsWith('/api/admin/'))return failure('not_found',404);
    if(!await authorized(request,runtime))return failure('sign_in_required',401);
    if(path==='/api/admin/content'&&request.method==='GET')return json((await load(runtime)).document);
    if(path==='/api/admin/upload'&&request.method==='POST') {
      if(Number(request.headers.get('content-length'))>MAX_IMAGE_BYTES)return failure('image_too_large',413);
      const bytes=await readBytes(request,MAX_IMAGE_BYTES,'image_too_large');
      if(!bytes.length||bytes.length>MAX_IMAGE_BYTES)return failure('image_too_large',413);
      const type=imageType(bytes);if(!type)return failure('unsupported_image',415);
      const id=crypto.randomUUID();await runtime.storage.putMedia(id,bytes,type);
      return json({url:'/api/media/'+id},201);
    }
    if(path==='/api/admin/content'&&request.method==='PUT') {
      const input=await readJson(request);
      const current=await load(runtime),document=structuredClone(current.document);
      if(!Number.isInteger(input.revision)||input.revision!==document.revision)return failure('content_changed',409);
      if(input.action==='upsert') {
        const previous=document.items.find(item=>item.id===input.item?.id);
        const item=validateItem(input.item,previous);
        if(!previous&&document.items.length>=500)return failure('catalog_full');
        if(previous)document.items[document.items.findIndex(entry=>entry.id===item.id)]=item;
        else document.items.unshift(item);
      } else if(input.action==='status') {
        const item=document.items.find(entry=>entry.id===input.id);
        if(!item||!STATUSES.includes(input.status))return failure('invalid_item');
        const updated=validateItem({...item,status:input.status},item);
        document.items[document.items.findIndex(entry=>entry.id===item.id)]=updated;
      } else if(input.action==='settings')document.settings=validateSettings(input.settings);
      else return failure('invalid_request');
      document.revision++;
      if(encoder.encode(JSON.stringify(document)).length>2*1024*1024)return failure('catalog_full');
      if(!await runtime.storage.save(document,current.version))return failure('content_changed',409);
      return json(document);
    }
    return failure('not_found',404);
  } catch(error) {
    const codes=['invalid_item','title_required','invalid_image','photo_required','body_required','category_required','invalid_price','invalid_quantity','invalid_instagram','invalid_email','invalid_currency','contact_required','invalid_request','request_too_large','image_too_large'];
    if(codes.includes(error?.message))return failure(error.message,['image_too_large','request_too_large'].includes(error.message)?413:400);
    throw error;
  }
}
