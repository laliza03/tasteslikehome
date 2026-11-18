const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const dist=path.join(__dirname,'../public');
const context={window:{}};
vm.runInNewContext(fs.readFileSync(path.join(dist,'translations.js'),'utf8'),context);
const messages=context.window.SHOP_TRANSLATIONS;
function entries(object,prefix='') {
  return Object.entries(object).flatMap(([key,value])=>typeof value==='object'?entries(value,prefix+key+'.'):[[prefix+key,value]]);
}
test('all three languages have complete copy and matching interpolation values',()=>{
  const baseline=new Map(entries(messages.en));
  for(const language of ['en','fr','ar']) {
    const current=new Map(entries(messages[language]));
    assert.deepEqual([...current.keys()].sort(),[...baseline.keys()].sort());
    for(const [key,value] of current) {
      assert.ok(value.trim(),`${language}: ${key}`);
      assert.deepEqual((value.match(/\{\w+\}/g)||[]).sort(),(baseline.get(key).match(/\{\w+\}/g)||[]).sort(),`${language}: ${key}`);
    }
  }
});
test('static page copy and accessibility labels refer to real translation keys',()=>{
  const html=fs.readFileSync(path.join(__dirname,'../site/storefront.html'),'utf8');
  const keys=new Set(entries(messages.en).map(([key])=>key));
  for(const match of html.matchAll(/data-i18n(?:-html|-aria|-alt|-title)?="([^"]+)"/g))assert.ok(keys.has(match[1]),match[1]);
});
function boot({query='',saved=null,languages=['en-CA'],blockedStorage=false}={}) {
  const document={documentElement:{}};
  const context={document,URLSearchParams,location:{search:query},navigator:{languages},localStorage:{getItem(){if(blockedStorage)throw new Error('Storage blocked');return saved;}}};
  vm.runInNewContext(fs.readFileSync(path.join(dist,'language-init.js'),'utf8'),context);
  return document.documentElement;
}
test('shareable language links take precedence over stored and browser choices',()=>{
  for(const language of ['fr','en','ar']) {
    const result=boot({query:'?lang='+language,saved:'fr',languages:['en-CA']});
    assert.equal(result.lang,language);
    assert.equal(result.dir,language==='ar'?'rtl':'ltr');
  }
});
test('invalid language links fall back to saved preferences, then browser language',()=>{
  assert.equal(boot({query:'?lang=unknown',saved:'ar'}).lang,'ar');
  assert.equal(boot({saved:'unknown',languages:['de-DE','fr-CA']}).lang,'fr');
  assert.equal(boot({languages:['de-DE']}).lang,'en');
});
test('language initialization works when browser storage is unavailable',()=>{
  assert.equal(boot({blockedStorage:true,languages:['ar-DZ']}).lang,'ar');
  assert.equal(boot({blockedStorage:true,query:'?lang=fr'}).lang,'fr');
});
