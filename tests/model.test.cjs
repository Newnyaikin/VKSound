'use strict';const test=require('node:test'),assert=require('node:assert/strict');const {trustedLogin,mediaURL,AppError,audioRow,publicError}=require('../app/model.cjs');
test('official HTTPS sign-in hosts only',()=>{for(const u of ['https://vk.ru/','https://id.vk.com/auth','https://login.vk.ru/a'])assert.equal(trustedLogin(u),true);for(const u of ['http://vk.ru/','https://vk.ru.evil.test','https://evil.test/?vk.ru','https://x@vk.ru','https://vk.ru:99','file:///tmp/x'])assert.equal(trustedLogin(u),false);});
test('media host and scheme validation',()=>{assert.equal(mediaURL('https://psv4.useraudio.net/a?q=1'),'https://psv4.useraudio.net/a?q=1');for(const u of ['http://vk.ru/a','https://127.0.0.1/a','https://useraudio.net.evil.test/a','https://x@vk.ru/a','https://vk.ru:80/a','https://vk.ru/a\n'])assert.throws(()=>mediaURL(u),AppError);});
test('rows expose no access key or signed media URL',()=>{const r=audioRow({owner_id:1,id:2,title:'<img src=x onerror=alert(1)>',artist:'A',duration:30,url:'https://secret',access_key:'private'});assert.deepEqual(Object.keys(r).sort(),['artist','available','duration','key','title'].sort());assert.equal(r.title,'<img src=x onerror=alert(1)>');assert.equal(audioRow({owner_id:0,id:2}),null);});
test('blocked songs are not playable',()=>assert.equal(audioRow({owner_id:1,id:2,duration:3,permissions:{play:0}}).available,false));
test('raw transport errors are redacted',()=>assert.deepEqual(publicError(Error('password=secret')), {code:'INTERNAL',message:'Не удалось выполнить действие. Повторите позже.'}));

test('Wave CDN hosts and their subdomains are accepted',()=>{
 for(const host of ['vkuseraudio.ru','userapi.com','okcdn.ru'])
  for(const prefix of ['', 'psv4.', 'sun9-42.']){
   const url='https://'+prefix+host+'/audio/a.mp3?extra=secret';
   assert.equal(mediaURL(url),url);
  }
});
test('new media suffixes cannot be spoofed',()=>{
 for(const host of ['vkuseraudio.ru','userapi.com','okcdn.ru'])
  for(const url of ['https://'+host+'.evil.test/a','https://evil'+host+'/a','http://'+host+'/a','https://user:pass@'+host+'/a','https://'+host+':8443/a'])
   assert.throws(()=>mediaURL(url),AppError);
});
test('unsupported host diagnostics redact signed URL and credentials',()=>{
 const values=['https://cdn.example.test/private/token.m3u8?secret=TOKEN#PRIVATE','https://user:SECRET@userapi.com/private?TOKEN','javascript:SECRET','not-a-url-SECRET'];
 for(const value of values){
  try{mediaURL(value);assert.fail('must reject');}catch(e){
   assert.ok(e instanceof AppError);
   const out=JSON.stringify(publicError(e));
   for(const secret of ['SECRET','TOKEN','PRIVATE','token.m3u8','secret=','user:'])assert.equal(out.includes(secret),false);
  }
 }
 assert.throws(()=>mediaURL(values[0]),{message:/cdn\.example\.test/});
});
