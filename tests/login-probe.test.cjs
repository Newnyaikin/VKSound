'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {LoginProbe,sessionReady}=require('../app/login-probe.cjs');
const {VkClient}=require('./client-fixture.cjs');
const cookies=[{name:'remixsid',value:'fixture-private-cookie',domain:'.vk.ru'}];
const home='https://vk.ru/feed';
test('login hint accepts VK main pages and session cookie variants',()=>{
 for(const host of ['vk.ru','vk.com'])for(const name of ['remixsid','remixsid6','remixtsid'])
  assert.equal(sessionReady('https://'+host+'/feed',[{name,value:'fixture',domain:'.'+host}]),true);
});
test('login hint rejects VK ID, login forms, untrusted origins and credentials',()=>{
 for(const url of ['https://id.vk.ru/','https://login.vk.ru/','https://id.vk.com/','https://vk.ru/login','https://vk.ru/auth/a','https://vk.ru/oauth','https://vk.ru/restore','https://vk.ru/join','http://vk.ru/','https://vk.ru:444/','https://name:pass@vk.ru/','https://vk.ru.evil.invalid/','not a URL'])assert.equal(sessionReady(url,cookies),false,url);
});
test('cookie hint rejects absent, deleted, unrelated and malformed cookies',()=>{
 for(const value of [undefined,[],[{}],[{...cookies[0],value:''}],[{...cookies[0],value:'DELETED'}],[{...cookies[0],domain:'.evil.vk.ru'}],[{...cookies[0],name:'remixlang'}],[{...cookies[0],value:123}]])assert.equal(sessionReady(home,value),false);
});
test('local login ticks do not consume network budget before session hint',()=>{
 const p=new LoginProbe();for(let i=0;i<100;i++){assert.equal(p.reserve('https://id.vk.ru/',cookies),false);assert.equal(p.reserve(home,[]),false);}assert.equal(p.attempts,0);
});
test('login checks are spaced at least thirty seconds and bounded to three',()=>{
 let now=1000;const p=new LoginProbe({now:()=>now});
 for(let i=0;i<3;i++){assert.equal(p.reserve(home,cookies),true);assert.equal(p.reserve(home,cookies),false);now+=29999;assert.equal(p.reserve(home,cookies),false);now++;}
 assert.equal(p.exhausted,true);assert.equal(p.reserve(home,cookies),false);assert.equal(p.attempts,3);
});
test('reopening login cannot erase the existing cooldown',()=>{
 let now=1000;const p=new LoginProbe({now:()=>now});assert.equal(p.reserve(home,cookies),true);p.begin();assert.equal(p.reserve(home,cookies),false);now+=30000;assert.equal(p.reserve(home,cookies),true);
});
test('rate stop prevents further automatic probes in the same window',()=>{
 let now=1000;const p=new LoginProbe({now:()=>now});p.reserve(home,cookies);p.stop();now+=3600000;assert.equal(p.exhausted,true);assert.equal(p.reserve(home,cookies),false);
});
test('probe retains no cookie values or page URLs',()=>{
 const p=new LoginProbe();p.reserve(home,cookies);assert.equal(JSON.stringify(p).includes('fixture-private-cookie'),false);assert.equal(JSON.stringify(p).includes('vk.ru'),false);
});
for(const code of [6,9])test('web token error '+code+' stops without retry or private error disclosure',async()=>{
 let calls=0;const c=new VkClient(async()=>{calls++;return new Response(JSON.stringify({error:{error_code:code,error_msg:'fixture-private-server-detail'}}));});
 await assert.rejects(c.connect(),e=>e.code==='RATE'&&!e.message.includes('fixture-private'));assert.equal(calls,1);assert.equal(c.token,null);assert.equal(c.pending,null);
});
test('HTTP 429 is a rate limit and is not retried',async()=>{
 let calls=0;const c=new VkClient(async()=>{calls++;return new Response('fixture-private-response',{status:429});});await assert.rejects(c.profile(),{code:'RATE'});assert.equal(calls,1);assert.equal(c.token,null);
});
test('a verified token is reused during subsequent profile checks',async()=>{
 let tokens=0;const c=new VkClient(async url=>{if(url.includes('web_token')){tokens++;return new Response(JSON.stringify({type:'okay',data:{user_id:7,access_token:'fixture-token',expires:Date.now()/1000+3600}}));}return new Response(JSON.stringify({response:[{id:7,first_name:'Fixture'}]}));});
 await c.connect();await c.profile();await c.profile();assert.equal(tokens,1);
});
test('main process gates interactive and startup checks on local session hints',()=>{
 const s=fs.readFileSync(require.resolve('../app/main.cjs'),'utf8');
 const check=s.slice(s.indexOf('async function checkLogin()'),s.indexOf('function cancelLogin('));
 assert.ok(check.indexOf('loginProbe.reserve(')<check.indexOf('await client.connect()'));
 assert.ok(check.includes('vkSession.cookies.get({})'));assert.ok(!check.includes('force:true'));
 assert.match(check,/mine!==generation\|\|loginWindow!==w/);
 assert.match(s,/sessionReady\('https:\/\/vk.ru\/',cookies\)/);assert.match(s,/loginProbe\.begin\(\)/);assert.match(check,/loginProbe\.stop\(\)/);
});
